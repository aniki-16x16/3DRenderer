# 代码场景

当前场景以 TypeScript 类保存。`src/scenes/PBRScene.ts` 保存原有的十只 PBR 兔子、地面、灯光、相机、OrbitControls 及 Camera/Output GUI。每次创建场景实例使用独立内容和参数。

## 启动入口

```ts
const app = await Application.create(canvas);
await app.start(new PBRScene());
```

`src/main.ts` 只处理应用启动、选择场景和页面/HMR 关闭。修改这里实例化的类即可选择另一个场景。同一个 Application 只接受一次 start，加载中再次 start 也会拒绝；不支持运行时切换或场景实例重用。

## 创建新场景

继承 `Scene`，在 `setup(context)` 中组织内容、加载文件并建立 GUI。可选覆盖 `update(deltaSeconds, elapsedSeconds)` 进行逐帧更新。初始化完成后才会开始渲染。

`SceneContext` 只提供 canvas、共享资产集合 textures 和取消信号 signal。场景不需要持有整个 Application 或 Renderer。

```ts
export class MyScene extends Scene {
  constructor() { super("我的场景"); }

  protected override async setup(context: SceneContext) {
    const gui = this.scope.own(new GUI({ title: this.name }));
    // 在这里创建相机、添加物体和灯光，定义该场景自己的 GUI。
    // 异步加载应传入 context.signal，并在 await 后检查取消。
  }
}
```

相机通过 `activeCamera` 指定，物体和灯光通过 `add/remove` 管理，环境通过 `environment` 引用。Application 自动维护相机 aspect，并每帧调用 update 和渲染。

## 生命周期与归属

`new → loading → ready → destroyed`。setup 失败会清理已经创建的辅助资源；加载中关闭会取消信号，阻止晚到的初始化结果启动渲染。销毁幂等，销毁后的实例不能重新初始化。

- Scene 的 `scope` 拥有 GUI、控制器、事件订阅等辅助资源，跟随场景释放。
- GUI 使用 `scope.own(gui)`；控制器使用 `scope.adopt(controls, () => controls.dispose())`。
- 场景只借用资产纹理，继续由 `app.textures` 管理。场景内加载纹理时向 loadImage 的第三个参数传入 signal。
- Mesh、Material、Object 的 GPU 资源仍由 Renderer 的 SceneResources 管理，不要再次登记给场景 scope。
- 关闭请调用 `app.destroy()`：先停帧循环，再释放场景辅助资源、Renderer、纹理资产、Device。无需另外调用场景 destroy。

setup 内的异步操作应传入 signal（OBJLoader 已支持）。自定义加载器若无法取消，await 后调用 `signal.throwIfAborted()` 再修改场景。异常由 app.start 的 Promise 向调用者报告；逐帧异常也会触发统一清理。

这里保存的是代码场景定义；运行中通过 GUI 调整的值不会写回源文件，也不会持久化到磁盘。

## 验证

`npm test` 验证初始化、失败、加载中关闭、重复启动和资源释放。`/tests/browser.html` 验证原有 GPU 回归以及 PBRScene 的内容、渲染、GUI 和控制器清理。


## GUI 参数绑定

曝光属于场景，材质参数属于材质。GUI 直接绑定真实状态，不需要 onChange 回调、手动上传或 needsUpdate：

```ts
this.output.exposure = 3;
gui.add(this.output, "exposure", 0, 10, 0.1);
gui.add(material, "metallic", 0, 1, 0.01);
gui.add(material, "roughness", 0.05, 1, 0.01);
```

修改 `material.baseColor[0]` 等数组元素同样会在下一帧生效。多个物体共享同一个材质时，修改会影响所有使用者；希望独立调参就创建独立材质实例。当前 PBRScene 保留原有兔子参数阵列，未给全部兔子强加统一参数控件。

每帧先执行 Scene.update，再准备材质资源、同步 Uniform，最后绘制。PBR、Phong、SolidColor 通过 syncUniforms 读取自身字段，UniformSync 复用暂存区并比较上次上传的字节，仅变化时上传。同一材质每帧只检查一次；首次使用和 GPU Buffer 重建后自动重新上传。数字修改不重建 Pipeline 或 BindGroup，纹理替换继续单独刷新绑定。

Application / SceneContext / Renderer 不再提供 setExposure。Output Pass 从 `scene.output` 读取输出设置，默认 exposure 为 1。若绕过 Renderer 直接使用材质，需要初始化后、绘制前自行调用 syncUniforms(device)。新增材质可实现同一接口；这套同步目前只覆盖已有 Uniform 数值，不负责自动重建因管线配置变化而失效的 Pipeline。
