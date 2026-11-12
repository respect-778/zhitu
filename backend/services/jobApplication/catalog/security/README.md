# 岗位库本地安全扫描

这组脚本支撑交接计划 3.5 节的静态检查。扫描器不运行待审代码、不安装待审依赖、不登录云服务，不把源码、规则或依赖清单上传给扫描服务。

## 使用

在 PowerShell 7 中执行。准备步骤联网获取官方固定版本工具和公共 npm 漏洞库，不挂载项目。下载缓存位于 `outputs/job-catalog-handoff-2026-11-08/evidence/2026-11-09/security-tools`，不加入生产依赖。

```powershell
pwsh -NoProfile -File D:\knownai\ai-job-application\catalog\security\prepare-tools.ps1
pwsh -NoProfile -File D:\knownai\ai-job-application\catalog\security\self-test.ps1
pwsh -NoProfile -File D:\knownai\ai-job-application\catalog\security\test-boundaries.ps1
pwsh -NoProfile -File D:\knownai\ai-job-application\catalog\security\test-path-safety.ps1
pwsh -NoProfile -File D:\knownai\ai-job-application\catalog\security\invoke-local-scan.ps1
```

扫描默认只挂载 `catalog`。可用 `-SourceRoot` 指定该目录的子目录，或将需要审查的独立代码包有意复制到 `ToolsRoot/review-inputs/<包名>` 后指定它。拒绝整个仓库、用户目录、目录链接、任意 `.gitleaksignore`，以及含真实 `.env`／常见密钥文件的输入。`.env.example` 等允许进入扫描，仍应先确认仅含占位值。在 PowerShell 中通过 `& <脚本路径> -Scanner @('semgrep','gitleaks')` 只运行选定扫描器。默认同时运行 OSV；没有锁文件会明确失败，不能视作依赖通过。npm workspace 根锁文件应仅将待审范围及锁文件暂存到独立代码包，再审查包范围是否准确，不能挂载整个仓库。

`self-test.ps1` 生成惯用危险调用、无风险对照、假 GitHub PAT 和有已知漏洞的 lodash 锁文件。它们仅作为文字被扫描，绝不执行。自测通过只证明这些样本被检出，不证明业务安全。

`test-boundaries.ps1` 验证干净输入退出 0、真实 Gitleaks 假令牌检出退出 10 并由包装脚本返回 1、加入实际 fingerprint 抑制文件后被拒绝；另验证缺清单、哈希错误、创建容器失败，以及 reports/bin/cache/嵌套 cache、准备脚本和自测输入目录的 junction。失败后外部哨兵目录必须未变。扫描器写部分 JSON 后返回 1 的场景使用明确的合成扫描器替身验证，未强制触发真实 Gitleaks 超时。测试不移动或清理其他 review-inputs，完成后仅移除本次创建且路径已核验的 junction。

`test-path-safety.ps1` 验证普通文件/目录、允许创建的缺失路径、必须存在的输入缺失、文件/目录类型误用，以及悬空 junction 的末端、祖先和目录后代拒绝。未修改文件 ACL。路径元数据使用 `.NET File.GetAttributes`，每次仍从卷根逐级读取，禁止跨次缓存；只将 FileNotFoundException/DirectoryNotFoundException 视为缺失，权限、共享冲突和其他 I/O 错误继续向上传播。Windows 返回链接自身的属性，见 [Microsoft GetFileAttributes 说明](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileattributesw)。

## 隔离与证据

- 扫描容器固定镜像 digest，`--pull=never`，`--network none`，UID/GID 65532、`cap-drop ALL`、`no-new-privileges`、只读根文件系统；2 CPU、2 GiB 内存、禁止额外 swap、128 PID；`/tmp` 是 256 MiB 临时文件系统。
- 只挂载待审目录和规则为只读，工具二进制／漏洞缓存按需只读，以及本次专属输出目录为可写。不挂载宿主环境变量、用户目录、Docker socket 或其他业务目录；容器只注入明确的无秘密配置。
- `path-safety.ps1` 在使用实际路径前检查文件/目录自身与全部祖先；目录挂载会逐层检查所有后代，禁止 reparse point。下载、解压、报告与自测写入也使用此边界。脚本和宿主管理员必须可信；这不是针对恶意宿主并发改目录的原子文件系统隔离，运行时不要并发修改工具缓存或输入树。
- Semgrep 使用本地 13 条 JS/TS、Python、Go 审查规则；关闭 metrics、版本检查、目标目录 ignore 文件和源码内抑制标记，不启用云扫描。`--x-ignore-semgrepignore-files` 是固定版本支持的内部参数，升级工具必须重跑自测。网络发送、文件读取、环境访问等是人工审查线索，不能自动判定为恶意。规则不声称覆盖全部框架、跨文件数据流或编码混淆。
- Gitleaks 使用固定版本内置规则，强制可信配置、忽略目标自带的 allow 注释、100% 脱敏；因 8.30.1 仍加载 source/.gitleaksignore，包装脚本直接拒绝输入树内该文件，不依赖 ignore-path 参数关闭它。只扫描当前文件，未扫描 Git 历史。
- OSV 明确使用 `--offline`、禁用依赖解析及 Go/Rust 调用分析；仅有 npm 离线库，缓存布局为 `cache/osv-scalibr/npm/all.zip`。未配置其他生态数据库时不能宣称其依赖通过。库来自官方 HTTPS 端点，SHA256 为本地固定记录，不是另行认证的官方摘要。缓存不自动更新；交付前核对下载日期，后续发行前另行更新并复审。
- 每次保存输入文件／规则 SHA256、逐参数命令、容器 inspect、退出状态、标准输出／错误、JSON 发现和汇总。包装脚本退出码 0 仅表示所选扫描器在此范围没有发现；1 为待审发现；2 为运行失败。Gitleaks 使用专用发现退出码 10，实际退出 1 等错误即使留下 JSON 也归入错误。预检、哈希或创建失败统一返回 2，并保存不含原始异常文本的错误摘要；输出路径不安全时只写 stderr。必须查看错误、跳过文件和扫描范围。

Semgrep 默认排除 `node_modules`、`.git`、`dist`、`security`，单文件上限 2 MB、每规则 15 秒；依赖源码需要另行暂存到 `review-inputs` 扫描。OSV 检查锁文件中的已知漏洞，不证明包无后门。GuardDog 尚未安装或运行，恶意依赖检测未完成。动态网络／文件／进程监控、SSRF／重定向／路径／文件解析边界、生产权限和部署配置仍需单独审查；不能将这组报告当作最终上线批准。

报告可能含源码片段和本地路径，仅保存在专属证据目录。Gitleaks 报告经过脱敏；其他扫描报告不保证清除所有源码中的秘密，仍需按本地敏感审查资料管理。

官方依据：[Semgrep 指标说明](https://semgrep.dev/docs/metrics)、[Semgrep 发布](https://github.com/semgrep/semgrep/releases/tag/v1.184.0)、[Gitleaks 8.30.1 用法](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md)、[OSV 2.7.0 离线模式](https://github.com/google/osv-scanner/blob/v2.7.0/docs/offline-mode.md)。
