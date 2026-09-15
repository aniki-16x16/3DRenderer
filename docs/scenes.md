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

`SceneContext` 只提供 canvas、共享资产集合 textures、取消信号 signal 和曝光设置入口 setExposure。场景不需要持有整个 Application 或 Renderer。

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
