# Context

用户反馈 Welcome 页面“为什么选择 Knowvai”右侧 FallingText 区域会吞掉页面滚轮。

事实：FallingText 使用 Matter.Mouse.create(container)，Matter.js 默认给容器绑定 wheel listener，并在 mousewheel handler 中调用 preventDefault；项目组件卸载时原先没有清理该监听和 requestAnimationFrame。

方案：只解除 wheel listener，保留 mousemove/mousedown/mouseup 及触摸事件；卸载时逐一移除监听、清理 source events，并取消动画帧。
