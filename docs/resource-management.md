# 资源管理与数据布局

目录与渲染流程见 [项目结构](./architecture.md)。日常通过 `Application.create(canvas)`、`await app.start(scene)` 和 `app.destroy()` 使用应用。场景内容参考 `src/demos/`，启动选择位于 `src/main.ts`。

## 初始化与所有权

不需要手动调用 Mesh / Material / Object3D 的 initialize。SceneResources 在首次提交时准备资源，同一 Mesh 或 Material 被多个对象引用时只初始化一次。每帧同步材质参数，并在多个 Pass 绘制前为每个对象上传一次模型矩阵。

| 资源                                       | 所有者                                     | 释放时机                                      |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------- |
| GPUDevice、画布上下文、帧循环              | Engine，由 Application 管理                | app.destroy                                   |
| HDR 和主深度纹理                           | FrameTargets                               | 尺寸替换或 Renderer 销毁                      |
| 相机、光源和时间 Buffer                    | FrameBindings                              | 扩容替换或 Renderer 销毁                      |
| 阴影贴图、矩阵和材质                       | ShadowPass                                 | Renderer 销毁                                 |
| 输出管线、曝光 Buffer 和输入绑定           | OutputPass                                 | Renderer 销毁                                 |
| 已提交的 Object3D、Mesh、Material GPU 资源 | SceneResources                             | releaseUnused 或 Renderer 销毁                |
| 文件纹理与默认黑/白/法线纹理               | TextureResources                           | 显式释放或应用销毁                            |
| GUI、控制器、监听器                        | Scene.scope 或入口登记的 Application.scope | 对应 scope 销毁                               |
| 采样器及 Layout/Pipeline 缓存              | 按 GPUDevice 缓存                          | 设备销毁释放 GPU 资源，设备不可达后缓存可回收 |

ResourceScope 按登记的逆序清理；同一对象不重复登记；一个清理函数抛错不会阻止剩余清理。已销毁的 scope 拒绝新资源并立即清理它。借用资源不登记为自有资源。

GUI 可用 `scope.own(gui)`，控制器可用 `scope.adopt(controls, () => controls.dispose())`，事件监听器用 `scope.defer(...)` 登记取消操作。异步场景加载遵循 [场景生命周期](./scenes.md)。

## 移除、共享与回收

`scene.remove(object)` 仅移除引用，不销毁共享 Mesh 或材质。需要回收时：

```ts
scene.remove(object);
app.renderer.resources.releaseUnused(scene);
```

releaseUnused 以该场景作为完整保留集合。若手动用同一 Renderer 轮流绘制多个场景，必须考虑其他场景的引用。应用入口目前不提供运行时场景切换。

已回收的 CPU 对象可重新加入，下一次绘制会重建 GPU 资源。资产纹理不参与此回收；已释放的资产纹理不能重新使用，需要创建新纹理并替换引用。

同一 Mesh、Material 或 Object3D 实例只能归属一个 Renderer。跨 Renderer 使用会报错。低层 initialize/destroy 保留用于独立实验；交给 Renderer 管理后不要从外部手动重建或销毁。

## 数据布局

`src/renderer/layouts/BufferLayouts.ts` 定义相机、模型、光源和材质的 CPU/WGSL 字段协议。`src/gpu/StructLayout.ts` 负责偏移、对齐和具名写入：

```ts
const data = lightLayout.create({
  position: light.transform.positionRaw,
  light_type: 1,
  color: light.color,
  intensity: light.intensity,
});
lightLayout.write(data, { direction });
```

当前 Light 为 48 字节、Camera 为 80 字节、PBR 为 32 字节。vec3f 对齐到 16 字节但占 12 字节，随后 u32 可放在第 12 字节。

StructLayout 仅支持当前使用的 f32、u32、vec2f、vec3f、vec4f、mat4x4f；不是完整 WGSL 解析器。改字段时必须同步 WGSL 声明。绑定协议在 BindGroupLayouts，顶点槽位在 VertexLayouts。

## 帧数据和参数同步

FrameBindings 将 `scene.lights.length` 写入相机的 light_count。光源 Buffer 容量至少为 1，增长时通常翻倍且受设备上限约束；删除光源不缩容。扩容与环境纹理变化会更新场景绑定，成功后才释放旧 Buffer。

ShadowPass 保持当前只使用第一个光源的规则。FrameBindings 借用它的深度 View 和矩阵 Buffer，不负责销毁。FrameTargets 仅在尺寸变化时重建附件，OutputPass 仅在 HDR View 变化时刷新输入绑定。

材质参数由 `syncUniforms` 同步，UniformSync 比较字节并跳过未变化的数据。共享材质每帧只同步一次。数值改变不重建管线和绑定；Phong 换纹理只刷新相关绑定。曝光通过 `scene.output.exposure` 设置，由 OutputPass 消费。

自定义材质声明 shaderSource，或在首次使用前调用 `renderer.resources.setShaderSource(material, source)`。SceneResources 不依赖具体材质类。

## 验证

`npm test` 检查布局、容量增长、共享、回收、失败清理与每帧编排；`npm run build` 检查类型和打包；`/tests/browser.html` 检查真实 WebGPU 调用。构建与 Node 测试不能替代 GPU 运行时验证。
