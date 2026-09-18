# 纹理资源管理

## 所有权

- `Application.textures` 拥有文件纹理与默认白色、法线纹理，关闭应用时统一释放。
- `Scene.environment`、材质与预览只借用纹理。删除场景物体、销毁材质或 `releaseUnused(scene)` 不释放资产纹理。
- Renderer 通过 FrameTargets 管理 HDR 和主深度附件，通过 ShadowPass 管理阴影目标；这些模块随 Renderer 统一销毁。
- 独立 `new ForwardRenderer(engine)` 会创建自己的 `renderer.textures`；传入纹理集合时只借用它。集合必须来自同一个 GPUDevice。
- 不进行自动引用计数。默认将资产保留至应用结束；提前释放前，调用者必须解除所有引用并刷新相关绑定。

## 普通图片

```ts
const texture = await app.textures.loadImage("/assets/environment.png", {
  colorSpace: "linear",
});
scene.environment = texture;
```

这里仅设置场景引用。根据图片实际编码选择 `linear` 或 `srgb`；颜色贴图通常使用 `srgb`，数据贴图使用 `linear`。

`loadImage` 面向浏览器可解码的普通图片，不是 Radiance HDR / EXR 解码器。`src/assets/loaders/ImageLoader.ts` 只下载、解码，返回的 ImageBitmap 由调用者关闭。资产集合的 `loadImage` 已负责关闭；`fromImage` 借用外部图片，不会关闭它。

与旧 API 的区别：不再 `new Texture().initialize()/load()`，而是由资产集合返回一张已经分配的新资源；没有内部替换或销毁后重新初始化。

## 换图与释放

```ts
const next = await app.textures.loadImage("/assets/albedo.png", { colorSpace: "srgb" });
material.texture = next;
// 下一次 render 的 prepareResources 会刷新 Phong 的 BindGroup。
```

只改变纹理引用会刷新绑定，不重建 Pipeline 或材质 Uniform Buffer。设置为 `null` 恢复默认纹理。若直接初始化 Phong，先调用 `material.prepareResources(device, textures)`；常规 Renderer 路径自动完成。

旧资源默认仍属于集合。确认所有材质、环境与预览都不再引用它，且相关绑定已经更新后，可调用 `app.textures.release(old)`。默认纹理只随整个集合释放。切换 URL 的多个并发请求分别产生独立资产；UI 若要求“最后一次选择生效”，应通过 `loadImage(url, options, signal)` 取消旧请求或自行检查请求编号。

## 原始数据与独立实验

`textures.create(GPUTextureDescriptor)` 接受完整格式、尺寸、用途和 mip 配置，不局限于 8 位图片。外部 HDR 解码器可以将结果交给自己的上传步骤，GPU 分配仍由该集合拥有。`texture.texture` 提供上传目标；`texture.view` 是稳定的默认 View，`texture.createView(descriptor)` 可创建其他 View。

短期实验可以创建 `new TextureResources(device)`，通过 `app.scope.own(...)` 登记；实验结束时先停止所有消费者，再销毁该集合。它不能被场景扫描自动回收。不要直接销毁借来的纹理，也不要把它登记给第二个作用域。

销毁集合会取消在途下载。无法中断的解码晚到时会关闭 CPU 图片，不再分配 GPU 纹理。上传发生同步异常时会回收本次分配；GPU 异步校验错误仍需浏览器的 validation error scope / uncapturederror 诊断。

## 验证

- `npm test`：所有权、回收、引用替换、异步关闭、失败清理与并发加载。
- `npm run build`：类型与打包。
- 启动开发服务器后打开 `/tests/browser.html`：真实 GPU 的加载、换图、默认纹理恢复及原有渲染回归。此测试不证明环境采样或 IBL 算法正确。
