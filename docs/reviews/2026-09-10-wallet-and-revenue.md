# 2026-09-10 钱包与收入对账批次验收

## 范围与边界

继续上一批工作：收入对账最小上线、iMac 同步/编译、移动端品牌规范对齐，
并修复检查中发现的扩展最近交易排序和 js-yaml 依赖告警。
没有上传 App Store、TestFlight、Google Play 或 Chrome Web Store；没有把钱包
PR 合并到生产主分支；没有操作真实钱包助记词、私钥、签名或链上转账。
其他产品、实体手机和 Bilin 模拟器没有改动。

## 已验证的结果

### 收入对账

- 修复 PR：<https://github.com/BurritoLabs/burrito-ai/pull/1>。
- 2026-09-10 04:14:22 UTC 仅原子替换服务器
  `/data/projects/burrito-ai/backend/dist/src/services/web-fee-service.js`，
  仅重启 `burrito-ai-allocator`；API、worker、web 的 PID 未改变。
- 文件 SHA-256：`96c16690d1c38fd562a37a854242d387f2b7efcf04b2e2adfc2ed48b5b516a46`。
- 04:20:20 UTC 验收覆盖 358.5 秒（对账周期 300 秒）：错误日志新增 0 字节、
  allocator 没有额外重启、公开 health HTTP 200/ok。
- 有效 `WEB_FEE_SWEEP_MODE=disabled`，四类待处理计数均为 0，未产生新 sweep。
  已有九月收据仍为 retained；期间没有新收费收据，不能据此声称真实新入账已经验收。
- 已部署模块的只读预演：LUNC 成功；Luna 范围查询 400 后收款人查询返回 200，
  历史候选不符合收费条件，imported=0。没有用预演写入数据库。
- 原补丁编译/67 测试通过；叠加最新 main 后编译/90 测试通过。
- 04:21:08 UTC 合入 AI main，合并提交
  `25fd651763a620041860a5eb02583bdc5cd9be57`。仓库没有工作流或 webhook 自动部署配置。
  本地 AI 工作区原有未提交改动完整保留。
- 单文件回滚备份保留于
  `/data/projects/burrito-ai/release-revenue-a5a12d9-20260910T041301Z/web-fee-service.before.js`。
  回滚只需同目录临时文件原子还原并重启 allocator，不要发布旧的整份 dist。

### Chrome 扩展

- 提交 `12e304c1e11e4c622b861b3226f2918a48c6c77f`：三个交易查询显式请求
  `ORDER_BY_DESC`、第 1 页、每页 20 条，合并去重后保留最新 20 条。
  先复现默认升序只取旧页的问题，再验证两链和交错账户请求。
- 128 测试、typecheck、生产构建、ZIP、权限及商店包静态校验通过。
- [PR 4](https://github.com/BurritoLabs/burrito-wallet-extension/pull/4)
  已非强制快进更新，包含两条之前未进入 PR 的品牌提交。
- [CI 34436540649](https://github.com/BurritoLabs/burrito-wallet-extension/actions/runs/34436540649)
  成功，提交为 `12e304c`。未合并 main、未上传商店。
- 本地 ZIP：`C:/Users/fengz/Documents/burrito-wallet-extension/.output/burritolabswallet-extension-0.1.0-chrome.zip`。
  SHA-256：`bb880e145365397d1ea80e69e7120bff9d4747bf9e70cd5fe4ca29e49eff3916`。

### 移动端品牌与原生构建

- 品牌提交 `49426f5fa52321a8f7677a3428cf2088bb049c55`，文件字节保护提交
  `abf1be0c2864bb97dcff4fec3a9bfcdd34c1c332`。
- 原生创建/导入入口和交易确认页复用一个品牌组件：官方圆形图案、24/20/6、
  650/400、-1 tracking，安全区后 16 间距和 56 首行。大字号操作按钮可换行。
  iOS Debug/Release 字体均注册，Android 交付相同字体；正文不套用品牌字距。
- 同一批准版本 0.3.1 的 Montserrat WOFF2 精确实例化 400/650，独立重建比对
  322 个字形轮廓及所有字宽一致。iMac CoreText 加载实际 PostScript 字体名成功，
  20pt 下 B 的墨迹范围 y=0..14，没有回退系统字体。
- iMac 已同步到专用 `codex/ios-acceptance-20260910` 分支，原 main 保留。
  Xcode 26.6、macOS 26.5.2；模拟器 Release 编译成功，最终代码增量编译 16.9 秒，
  `codesign --verify --deep --strict` 通过，签名为 ad-hoc、无 TeamIdentifier。
  没有使用 Apple 开发证书或 Provisioning Profile。最终增量构建曾留下旧的 JS 资源签名，
  已在核对构建/安装 JS SHA 一致后仅重新签署模拟器包（ad-hoc），构建包和重装包均严格验证通过；
  此处不是声称自动增量签名已经修好。原生构建日志确实没有执行 CodeSign 步骤。
- iOS 构建目录：
  `/Users/jasonfeng/Developer/burrito-wallet-mobile/.build/DerivedData-ReleaseSigned/Build/Products/Release-iphonesimulator/BurritoWallet.app`。
- Android 四 ABI `assembleDebug` 成功；依赖修复后增量重编成功（1 分 12 秒）。
  APK 内 400/650 字体和 OFL 与源文件逐字节一致。
  Debug APK 由 Metro 提供 JS，不等同于离线 Release 包验收。
- Android APK：`C:/Users/fengz/Documents/burrito-wallet-mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
  SHA-256：`ec5cfb4410c0179e9d982d6d3467552f82ff182bf7f69e337a20b6c9f5727049`。
- 用户明确同意后，新建并启动专用 `Burrito QA 20260910` iPhone 17 Pro Max / iOS 26.5
  模拟器（`C85872A0-137B-494C-95D2-2B49747251BE`），没有启动旧设备。
- 实际 RN 截图发现文字高出图案约 2.17pt。提交
  `ef316b5501337b178d6d39e2b8967a7b8138b957` 根据字体度量恢复 RN iOS 缺失的
  2.19pt 半行距；共享 -0.17 光学校准、20/20、-1 tracking 不变，Android 补偿为 0。
  增加回归测试、字体度量和 RN 0.86.2 源码守卫；独立审查、lint、typecheck 通过。
- 修正后浅色和深色原图均为 1320×2868 / 3x：图案 bbox x=48..119、y=234..305，
  B 墨迹 y=249..289；中心差 0.5 个物理像素，即 0.167pt，符合 0.5pt 以内标准。
  图案在安全区后 x=16/y=16，完整 Burrito Wallet 保留。
- 浅色、深色下导入页的空安全键盘、禁用 Review、Cancel 返回生产 Dashboard 已验证；
  没有创建或输入助记词，没有验证真实解锁/签名/广播。
- 原生自定义协议入口原先失败：RN 的部分 URL 实现不能正确读取自定义协议的 host/path，
  Node 环境测试掩盖了问题。`27fd46c` 改成唯一入口的严格字符串匹配，新增真实 RN 与 Node
  双运行时 38 项测试。修正后模拟器冷启动、热启动都能打开钱包入口，无需调试启动参数。
- `ea5439a` 保持两处原生弹窗不透明，以 `overFullScreen` 留住接收系统主题通知的底层视图；
  `eb42b50` 关闭 WebView 抢占状态栏样式，保留 App 的唯一管理。实际运行中浅→深（欢迎页）、
  深→浅（空导入页）均正确更新页面与时间/电池颜色，原生取消/拒绝安全回归不变。
- [移动端 CI 34439148789](https://github.com/BurritoLabs/burrito-wallet-mobile/actions/runs/34439148789)
  于 04:57:58 UTC 成功：91 测试/14 suites 及全部静态门禁通过。
  Android/iOS 云端构建任务按既有付费构建开关跳过；本地原生构建证据单独记录。
- 最终源码为 `eb42b50b1d9e4c05ab1ce683ecb7b11af4676b20`，文档提交 `b482032`；
  Windows 与 iMac 全量 130 测试/14 suites 通过。PR 12 已非强制更新，未合并 main。
  [最终 CI 34440195452](https://github.com/BurritoLabs/burrito-wallet-mobile/actions/runs/34440195452)
  于 05:14:11 UTC 成功，head 为 `b4820329d4b6865144c0c411387c071b1cb26c0d`，
  130 测试/14 suites 及全部静态门禁通过；两项云端原生构建依旧按既有开关跳过。
- Dynamic Type 极大字号热切换后滚动仍复现文字按旧布局裁切。主题修复不能解决此问题，
  未关闭字体缩放或重挂载钱包状态掩盖失败。
  [RN 官方仓库同类报告](https://github.com/react/react-native/issues/57512) 作为排查线索，
  不把相似报告当作完整根因证明。平板和最终 Android 品牌画面、完整 VoiceOver 遍历仍未验收。
- 原始截图保留在本机
  `C:/Users/fengz/AppData/Local/Temp/burrito-ios-qa-20260910/`，iMac 对应目录
  `/tmp/burrito-ios-qa-20260910.4UEgve/`。主要通过证据为 `iphone-native-light-aligned.png`、
  `iphone-native-dark-final.png`、`iphone-import-light-final.png`、`iphone-import-dark-final.png`。
  大字号异常保留为 `iphone-native-large-actions.png`，没有删除失败证据。
- 最终新增通过截图：`iphone-deeplink-cold-final.png`、`iphone-statusbar-hot-dark-final.png`、
  `iphone-import-hot-light-final.png`。移动端详细验收和增量签名说明见
  `C:/Users/fengz/Documents/burrito-wallet-mobile/docs/ios-runtime-qa.md`。
- 专用模拟器保留在浅色、默认字号、无钱包的入口页，便于用户检查；其他模拟器未启动。
  创建和构建后 iMac 数据卷约剩 15GiB，本轮没有删除用户文件或旧模拟器。

### js-yaml 安全修复验证

- 发现：`npm run audit:production` 因
  [GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)
  失败。上游修复版本为 3.15.2 / 4.3.2。
- 源到汇：可控 YAML 配置经 cosmiconfig 元配置、ESLint 配置或 NYC YAML 加载器，
  到 js-yaml 的 load/mergeMappings。空源没有计入合并预算；解析后校验无法限制
  已经花费的 CPU。当前证据是构建工具配置入口，未证明钱包运行时远程可达。
- 最小策略：只更新锁文件的四个 js-yaml 副本，保留 3.x/4.x 主版本和现有父依赖范围，
  不改消费者、钱包逻辑、审计白名单或原有 image-size 补丁。
- 变更文件：移动端 `package-lock.json`、`__tests__/yamlMergeBudget.test.js`。
- 安全触发验证：小规模、限时子进程，旧版 8 个空源预算断言失败而 4 个正常控制通过。
  更新后 16 项通过，覆盖 load/loadAll、3.x safe APIs、别名序列和分散空源、
  100 项正常/101 项安全拒绝、合法继承/显式覆盖和多文档。
- 已执行验证：`node --check`、最终 diff 检查；聚焦测试及 live npm audit；
  全量测试（依赖补丁时 90 项，最终 130 项）/14 suites、lint（0 warnings）、typecheck、React Native config、
  品牌/平台/工作流/许可证/商店文案静态检查、production Web bridge 均通过。
- 独立修复前调查和全新审查者的修复后复核均通过；后者额外验证 126 个小规模断言，
  涵盖 CJS/浏览器/ESM 分发、3.x 安全别名和跨文档预算。正常 YAML 控制样本不受影响。
  Windows 与 iMac 全新锁定安装均通过，原有 image-size/WebView 补丁正常应用；
  iMac 全量测试、审计和 Release 原生重编通过。结果：本次 js-yaml 修复有效，
  无扩大依赖主版本或加入新豁免。
- 既有 `image-size` 两项高危公告仍可见，以限时回归验证的本地补丁保留；
  没有宣称 npm 原始告警为零。

### Web 回归

当前 Web 分支复查 160 测试通过；wallet-specs 的两链、隔离和意图校验通过。
本轮未重新执行整套浏览器 E2E，不把上一批 E2E 结果当作本轮重跑结果。

## 下一批顺序

1. 修复 iOS 运行中极大字号的布局刷新，并补齐增量构建签名校验；随后补平板、Android 最新品牌和 VoiceOver 验收。
2. 扩展补齐从钱包主动发起的转委托流程：选择目标验证人、费用/限制提示、确认与失败恢复。
3. 移动端多钱包：先设计兼容现有单钱包的安全迁移、切换和独立解锁/取消，补齐测试后实现。
4. 再补移动端原生 IBC 通道白名单、费用和可读签名确认；扫码、WalletConnect、Ledger 单独排期。

当前仍不是与旧 Station 完全功能对齐，也未达到所有平台可直接公开发布的状态。
