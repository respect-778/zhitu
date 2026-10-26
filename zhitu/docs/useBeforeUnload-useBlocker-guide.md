# React Router 导航拦截总结：`useBeforeUnload` 与 `useBlocker`

## 1. 这两个 Hook 分别解决什么问题

### `useBeforeUnload`
用于拦截“页面将被卸载”的场景，例如：
- 刷新页面
- 关闭标签页/浏览器
- 在地址栏输入新 URL 并回车

它触发的是浏览器原生离开确认能力，不属于 SPA 路由层。

### `useBlocker`
用于拦截“SPA 内部路由跳转”场景，例如：
- `navigate("/xxx")`
- 点击 `<Link />`
- 浏览器前进/后退（仍在当前 SPA 内）

它是 React Router 的路由阻塞机制。

## 2. 一句话对比

- `useBeforeUnload`：拦截“离开网页”。
- `useBlocker`：拦截“网页内切路由”。

这两个要配合使用，才能覆盖“未保存内容离开提醒”的完整场景。

## 3. `useBlocker` 的状态含义

`blocker.state` 常见有 3 个值：

1. `unblocked`
- 空闲态
- 当前没有被拦住的跳转请求

2. `blocked`
- 某次导航已被拦截
- 等待你决定“放行”还是“取消”

3. `proceeding`
- 你调用了 `blocker.proceed()`
- 被拦住的那次导航正在继续执行

## 4. `unblocked` 什么时候变成 `blocked`

必须同时满足两件事：

1. 发生了一次真实导航尝试  
例如：`navigate`、点击 Link、浏览器后退/前进（SPA 内）

2. `useBlocker` 的条件函数返回 `true`  
例如：`isDirty === true`

如果你只是 `setModalOpen(true)`，并没有发起导航，就不会进入 `blocked`。

## 5. 推荐实现模式（未保存内容拦截）

### 第一步：定义是否有未保存内容

```ts
const isDirty = titleValue.trim().length > 0 || contentValue.trim().length > 0
```

### 第二步：拦截离开网页（BOM）

```ts
useBeforeUnload((event) => {
  if (!isDirty) return
  event.preventDefault()
  event.returnValue = ""
})
```

### 第三步：拦截 SPA 路由跳转

```ts
const blocker = useBlocker(({ currentLocation, nextLocation }) => {
  if (!isDirty) return false
  return (
    currentLocation.pathname !== nextLocation.pathname ||
    currentLocation.search !== nextLocation.search ||
    currentLocation.hash !== nextLocation.hash
  )
})
```

### 第四步：配合自定义弹框

1. 当 `blocker.state === "blocked"` 时打开弹框  
2. 点击“离开”：`blocker.proceed()`  
3. 点击“取消”：`blocker.reset()`

## 6. 常见坑位

1. 以为 `useBlocker` 能拦刷新/关页  
它不能，这类必须走 `beforeunload`。

2. 返回按钮只开弹框，不触发导航  
这不会进入 `blocked`，因为没有导航请求。

3. 弹框“确定”里又手动 `navigate`  
应优先 `blocker.proceed()`，否则容易出现“要点两次确定”。

4. 条件表达式没加括号  
`&&` 和 `||` 优先级问题会导致误拦或漏拦，尤其是 `pathname/search/hash` 联合判断。

5. 发布成功后仍被拦截  
程序化跳转前应设置放行标记，避免把“正常离开”当成“未保存离开”。

## 7. 适合你当前发布页的实践建议

1. `isDirty` 只由“用户输入”决定，不掺杂弹框状态。  
2. 站内离开统一走 `useBlocker + antd Modal`。  
3. 刷新/关页统一走 `beforeunload` 原生提示。  
4. “保存成功/发布成功”后清理 dirty，并放行一次程序化跳转。  

## 8. 结论

`useBeforeUnload` 和 `useBlocker` 不是替代关系，而是互补关系。  
只用其中一个，都无法完整覆盖“未保存离开提醒”的真实用户行为。
