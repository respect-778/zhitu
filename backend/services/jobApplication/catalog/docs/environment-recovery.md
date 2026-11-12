# 本地环境恢复记录

2026-11-09 首次 docker info 报 Linux engine 管道不存在。启动 Docker Desktop 后，后端日志显示初始化 Inference manager 时无法删除本地 dockerInference 通信端点，导致全部引擎退出。

已按 aegis:systematic-debugging 核对运行时目录，只有 dockerEthernetVfkit、dockerInference、userAnalyticsOtlpHttp.sock 三个零字节通信文件。停止本轮启动的 Docker 进程后，将 LocalAppData/Docker/run 重命名为 run-jobcatalog-before-20261109，创建新的 run 目录并重新启动已安装的 Docker Desktop。

复验 docker version 成功返回 Linux Engine 29.7.2、Docker Desktop 4.86.0。已有容器由 Docker 原有启动策略恢复。先前运行时文件保存在上述备份目录。

此记录证明 Docker 引擎启动故障恢复。后续采集／扫描的权限、网络、文件边界和资源限制需要对具体容器另行验证。
