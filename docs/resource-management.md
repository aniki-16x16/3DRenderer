# 资源管理与数据布局

这次重构集中处理所有权、初始化顺序和 CPU/GPU 数据协议。PBR、Phong、阴影和顶点变换的计算公式保持原样；WGSL 仅将相机结构的尾部 padding 改为 `light_count: u32`，光源循环读取这个实际数量。

## 日常入口

参考 `src/main.ts`：

```ts
const app = await Application.create(canvas);
const scene = new Scene();
scene.activeCamera = camera;
const mesh = await new OBJLoader().load("/assets/obj/bunny_10k.obj");
scene.add(new Object3D("bunny", mesh, material));
scene.add(light);
app.start(scene);
// 页面退出或切换应用时
app.destroy();
```

不再调用 Mesh / Material / Object3D 的 `initialize`，不再初始化全局布局、默认纹理、采样器和阴影材质，也不需要填写光源数量。渲染器根据场景自动准备资源；同一个 Mesh 或材质被多个对象引用时只准备一次。

GUI 等额外资源也可以加入应用生命周期：

```ts
const gui = app.scope.own(new GUI());
app.scope.adopt(controls, () => controls.dispose());
app.scope.defer(() => window.removeEventListener("some-event", handler));
```

登记顺序应为被依赖资源在前、使用者在后。清理按逆序执行，同一对象不会重复登记；一个清理函数抛错不会阻止其余清理。已结束的 scope 拒绝新资源，并立即清理该资源。

异步加载返回后应检查 `app.scope.destroyed`，避免页面已经退出却继续创建场景。示例包含加载失败、页面离开和 Vite HMR 的清理。

## 所有权与共享

| 对象 | 所有者 | 释放时机 |
| --- | --- | --- |
| GPUDevice、画布上下文和循环 | Engine，由 Application 管理 | app.destroy |
| 深度纹理、光源缓冲、阴影资源 | ForwardRenderer | 替换或 renderer.destroy |
| 提交过的 Object3D、Mesh、Material、自定义 Phong 纹理 | SceneResources | releaseUnused 或 renderer.destroy |
| 默认白纹理、默认法线纹理、采样器和 Layout/Pipeline 缓存 | 按 GPUDevice 缓存 | device.destroy 释放设备资源，设备对象不可达后缓存可回收 |
| GUI、控制器和监听器 | Application.scope | app.destroy |

Scene 只保存引用。`scene.remove(object)` 不销毁共享 Mesh 或材质。希望立即回收当前场景不再引用的资源时调用：

```ts
scene.remove(object);
app.renderer.resources.releaseUnused(scene);
```

`releaseUnused` 以传入的场景作为完整保留集合。如果同一个渲染器轮流绘制多个场景，调用前需要考虑其他场景仍在使用的资源。默认不主动回收，避免临时切场景造成反复上传。已回收的 CPU 对象可以重新加入，下一次绘制会重新准备 GPU 资源；自定义纹理的图片内容需重新加载，因为 Texture 目前不保留 CPU 图片副本。

一个资源实例只能归属一个渲染器。跨渲染器复用同一资源会明确报错，避免绑定另一个设备的缓冲或被另一个渲染器提前释放。共享几何数据时可构造独立 Mesh 实例。低层 initialize/destroy 仍然保留用于学习和独立实验；资源交给渲染器管理后，不要再从外部手动销毁或重建。

## 数据布局

`src/graphics/BufferLayouts.ts` 集中描述相机、模型、光源和材质的数据协议。`StructLayout` 根据字段类型计算字节大小、偏移和尾部对齐，并按具名字段写入：

```ts
const data = lightLayout.create({
  position: light.transform.positionRaw,
  light_type: 1,
  color: light.color,
  intensity: light.intensity,
});
lightLayout.write(data, { direction });
```

例如 vec3f 对齐到 16 字节，但自身占 12 字节，因此随后一个 u32 能放在第 12 字节。调用者不再手算这个偏移，u32 也不会误写成浮点数。当前光源结构为 48 字节、相机为 80 字节、PBR 为 32 字节。

支持范围有意保持小：f32、u32、vec2f、vec3f、vec4f、mat4x4f。暂不支持嵌套结构、数组、其他矩阵或 WGSL 自定义对齐属性。增加这些类型时，需要先补齐对应布局规则。它不是完整 WGSL 解析器；修改协议字段仍需同步修改 WGSL 声明。

## 光源数量

`scene.lights.length` 每帧写入相机缓冲的 `light_count`。底层容量至少为 1，增长时通常翻倍，受设备 Buffer 和 storage binding 上限约束。删除光源不必缩容，Shader 不会访问容量中闲置的槽位；零光源时循环执行零次。

扩容替换 GPUBuffer 后必须重建引用它的场景 BindGroup，旧缓冲随即释放。该处理集中在渲染器内部。超过设备上限会抛出带数量信息的错误。

当前阴影仍来自第一个光源，其他光照能力和限制沿用原有实现。

## 模块职责

| 目录 | 当前职责 |
| --- | --- |
| foundation | 与 WebGPU 无关的所有权容器、二进制布局工具 |
| core | 场景、对象、变换、相机、光源及设备循环；尚非完全纯 CPU 层 |
| graphics | GPU 资源包装、布局协议、按设备缓存 |
| materials / shaders | 材质参数和 Shader 实现 |
| renderer | 自动准备场景资源、光源容量和现有渲染 Pass 的组织 |
| app | 应用创建、resize、循环和统一销毁入口 |
| loader / controls | 文件加载和输入交互 |

没有为移动目录而拆分所有类。Object3D 仍持有模型缓冲，Mesh 仍同时持有 CPU 和 GPU 数据；日后需要一个场景跨设备渲染时，再考虑将 GPU 状态彻底移入渲染器。

自定义材质在首次绘制前通过 `app.renderer.resources.setShader(material, source)` 注册 Shader 源码。PBR、Phong 和 SolidColor 已内置。材质参数仍在初始化时上传；本次没有引入运行时材质参数更新、纹理热替换或设备丢失后自动恢复。

## 验证

- `npm test`：使用 Node 24 的 TypeScript 支持，检查所有权、失败清理、布局、容量增长、共享资源和设备隔离。
- `npm run build`：TypeScript 和 Vite 构建。
- 启动 `npm run dev` 后打开 `/tests/browser.html`：在真实 WebGPU 设备上检查三种材质的光源增减、零光源、资源回收与重建、resize 和重复销毁。页面应显示 PASS。
- `/`：观察原来的 2×5 兔子阵列，操作相机确认视觉结果。

本次已通过上述 Node 测试、构建、浏览器 GPU 冒烟测试和示例出图检查。未进行跨浏览器、设备丢失恢复或长时间显存压力测试。
