# 项目结构与渲染入口

当前结构按职责划分。它服务于现阶段的学习与调试，不是不可调整的最终架构。

## 从哪里开始阅读

1. `src/main.ts`：创建应用，选择 `IBLScene`，连接帧率控件，处理页面退出和 HMR。
2. `src/app/Application.ts`：场景初始化、resize、逐帧更新与统一销毁。
3. `src/renderer/ForwardRenderer.ts`：一帧的准备、Pass 顺序和命令提交。
4. `src/renderer/passes/`：阴影、主场景和输出的具体命令编码。
5. `src/materials/`：材质参数、GPU 绑定与对应 WGSL。

## 目录边界

| 目录             | 职责                   | 放置原则                                                             |
| ---------------- | ---------------------- | -------------------------------------------------------------------- |
| app              | 应用与运行生命周期     | Application、设备/画布/循环所在的 Engine                             |
| scene            | 场景表达               | Scene、Object3D、Transform、Camera、Light、OutputSettings            |
| assets           | 可共享的几何和纹理资源 | Mesh、Texture、TextureResources；下载解析位于 loaders                |
| materials        | 材质与着色             | Material 基类、具体材质及就近存放的 WGSL                             |
| gpu              | WebGPU 工具            | Shader、PipelineCache、StructLayout、UniformSync、Samplers、资源标签 |
| renderer         | 当前前向渲染方案       | 资源准备、帧绑定、渲染目标、绘制命令、Pass 编排                      |
| renderer/layouts | CPU/WGSL 与绑定契约    | 字段布局、Group 约定、顶点槽位；区别于通用 GPU 工具                  |
| renderer/passes  | 每个 Pass 的专用实现   | ShadowPass、ForwardPass、OutputPass 及专用材质和 WGSL                |
| controls         | 输入交互               | OrbitControls                                                        |
| debug            | 调试 UI                | FrameRateMonitor                                                     |
| demos            | 具体实验场景           | IBLScene、PBRScene                                                   |
| utils            | 少量通用工具           | ResourceScope、数学单位转换                                          |

`gpu` 和 `utils` 不依赖具体场景、应用或 Pass。`renderer/layouts` 是共享契约，scene/materials 对它的依赖不意味着可以反向调用 Renderer。Renderer 通过 RenderHost 借用设备、画布尺寸和时间，不导入 Engine 或 Application。

当前没有强行分离所有 CPU/GPU 状态：Object3D 仍保存模型 Buffer/BindGroup，Mesh 仍包含 CPU 数据和 GPU 缓冲，材质仍创建自身管线。Engine 也继续集中管理设备和帧循环；以后有明确需求时再拆。

## 一帧的数据流

```text
Engine.tick
  → Scene.update
  → ForwardRenderer.render
      → SceneResources.prepare：初始化共享资源、同步材质、每对象上传一次模型矩阵
      → FrameTargets.resize：仅尺寸变化时替换 HDR 和主深度附件
      → OutputPass.setInput：仅输入 View 变化时更新绑定
      → FrameBindings.update：相机、灯光、时间与环境绑定
      → ShadowPass.update：第一个光源的阴影矩阵
      → ShadowPass.encode
      → encodeForwardPass
      → OutputPass.encode
      → queue.submit（一次）
  → onFrame(elapsedSeconds)：入口连接的可选调试回调
```

Pass 的 `encode` 只向调用方提供的 CommandEncoder 编码，不自行提交命令。`drawObjects` 负责管线/材质切换、顶点/索引绑定和 draw，不上传模型矩阵。主场景 Pass 没有自有资源，因此使用函数；不为统一外观增加空壳类或 Pass 基类。

## 模块资源归属

| 所有者         | 自有资源                                       | 借用资源                              |
| -------------- | ---------------------------------------------- | ------------------------------------- |
| Application    | Engine、Renderer、TextureResources、活动 Scene | 入口提供的 canvas                     |
| SceneResources | 首次提交的 Mesh/Material/Object3D GPU 资源     | 资产纹理                              |
| FrameTargets   | HDR 颜色和主深度纹理                           | Device                                |
| FrameBindings  | 相机/光源/时间 Buffer、场景绑定                | 环境纹理、阴影深度 View 和矩阵 Buffer |
| ShadowPass     | 阴影深度、阴影矩阵、阴影材质和绑定             | 场景中的光源与对象                    |
| OutputPass     | 曝光 Buffer、输出管线和绑定                    | HDR 输入和当前画布输出 View           |
| Scene.scope    | GUI、控制器、监听器                            | 资产纹理、Mesh、Material              |

资源按依赖顺序创建，逆序销毁。构造失败会清理已分配资源；尺寸变化分配失败时保留旧附件；光源扩容或环境重绑失败时保留旧绑定并回收失败的新 Buffer。这里处理同步异常，GPU 异步 validation 错误仍需真实浏览器检查。

## 材质扩展

具体材质声明 `readonly shaderSource`，对应 WGSL 与实现就近放置。SceneResources 按源码复用 Shader，不再识别 PBR/Phong/SolidColor 类型。

临时实验可在首次准备前调用 `renderer.resources.setShaderSource(material, source)` 覆盖源码。完成初始化后禁止覆盖；不提供运行中 Shader 热替换。新增材质应使用能区分其布局的 `materialKind`，并实现自己的资源准备与 Uniform 同步。

## 命名迁移

| 原名称                           | 当前名称                         |
| -------------------------------- | -------------------------------- |
| ParallelLight                    | DirectionalLight                 |
| LightTypeEnum.Parallel           | LightType.Directional            |
| Light.DataSize / packData        | Light.byteSize / packGpuData     |
| StandardLayouts                  | BindGroupLayouts                 |
| StandardVertexBufferSlot         | VertexBufferSlot                 |
| ResourceCache / getResourceCache | PipelineCache / getPipelineCache |
| Output2Canvas / render           | OutputPass / encode              |
| Material.TAG / ID；Shader.ID     | Material.kind / id；Shader.id    |
| Phong.specColor                  | Phong.specularColor              |
| Engine.init                      | Engine.initialize                |
| SceneResources.setShader         | SceneResources.setShaderSource   |

这些内部 API 已在源码、测试和示例中同步更新，未保留旧名称别名。CPU/WGSL 字段协议与着色算法未改变。

## 验证方式

- `npm run build`：类型与打包。
- `npm test`：共享资源、帧数据、Pass 顺序、失败回滚、材质扩展、生命周期。
- 开发服务器的 `/tests/browser.html`：真实 WebGPU 的材质、光源增减、参数更新、换图、resize、回收重建和场景销毁。
- `/`：观察当前 IBL 实验场景、相机交互和 FPS 面板。此观察不证明 IBL 算法已经完整或正确。
