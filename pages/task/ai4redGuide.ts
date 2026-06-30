/**
 * AI4RED 红线验证 — 使用指南 markdown 内容
 *
 * 在 CreateTaskDialog 中选择 "AI4RED 红线验证" 工具后，
 * 点击 "具体要求见说明" 弹出 modal 渲染此 markdown。
 */
export const AI4RED_GUIDE_MARKDOWN = `## 工具简介

红线扫描工具将公司安全红线验证过程通过多智能体联合执行，实现自动化和智能化验证，并且把验证过程输出形成Markdown文档报告，保障版本发布合规安全。

## 输入交付件要求

红线扫描工具实际执行时由不同的智能体分工执行，各个智能体所需的交付件见下表。其中附件可以从 **[输入交付件下载链接](https://onebox.huawei.com/p/0e8321fc1eea1389543acc87790eccbe)** 获取。

**注意**：

- 所有输入交付件准备好之后压缩成一个包上传，支持 \`zip/rar/tar.gz\` 格式
- 如果是从获取的模板中修改内容后上传，**请不要修改模板原有文件名**，可以增加其他内容。比如《送检环境信息模板.xlsx》需保留 \`送检环境信息\` ，可以改成 《送检环境信息--xxx产品.xlsx》
- 环境信息只能上传一份，其他交付件可以多份共存


| 智能体               | 所需交付件                                  | 覆盖条款                             |
|-------------------|----------------------------------------|----------------------------------|
| Root特权账号验证智能体     | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》                        | RL-5.4.1-1                       |
| 易质疑组件扫描智能体        | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》                        | RL-5.3.1-1                       |
| 口令安全验证智能体         | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》                        | RL-8.1.1-2、RL-8.1.1-3、RL-8.1.2-4 |
| 应用安全智能体 | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》 | RL-4.1.2-1、RL-4.1.4-1、RL-4.1.8-1、RL-4.1.8-2 |
| 安全通道验证智能体         | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》                        | RL-7.1.2-1、RL-8.1.3-1            |
| 完整性，源码等过程性扫描验收智能体 | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》、《CodeCheck代码扫描模板.xlsx》。CodeCheck扫描结果直接从公司流水线中可以导出 | RL-12.1.1-1、RL-13.1.1-1          |
| 通信矩阵智能体 | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》、《通信矩阵模板.xlsx》。通信矩阵模板 [来源](https://w3.huawei.com/pdmcplus/#/workflowAssets/detail/zh_CN/5/BI0000008194001/3?treeId=b82c9570-3c06-11e8-2d5f-286ed48992c2) 。<br>**请提供产品和配套平台的通信矩阵**，如果未提供配套平台的通信矩阵，实际环境扫描出来的结果会匹配不到平台的端口 | RL-1.1.3-1、RL-1.1.3-2、RL-1.1.3-3 |
| 安全编码编译智能体 | 《[送检环境信息模板.xlsx](https://onebox.huawei.com/p/ae81d6e986ee392cdd87b1e94a2c8725)》、《XXXX V500R024C00.Secure_Compilation_Result》。安全编译报告来自 [SecBinaryCheck](https://secguard-szv.clouddragon.huawei.com/secguard/tool/engine/secbincheck/riskassess/tasks) | RL-13.1.2-1、RL-13.1.2-2、RL-13.2.1-1、RL-13.2.1-2、RL-13.2.1-3 |
| 病毒扫描验证智能体 | 参考《virusScanReport.zip》，可以是单独的Word扫描报告也可以是导出的zip包。病毒扫描报告来源：[VirusScan](https://secguard-szv.clouddragon.huawei.com/secguard/tool/engine/virus/tasks) | RL-5.2.1-1、RL-5.2.1-2 |
| 漏扫与软件生命周期验证智能体 | 参考《主机漏洞扫描.zip》，可以是单独的Excel扫描报告也可以是导出的zip包。主机漏洞扫描可以从SecGuard上导出：[GSM](https://secguard-szv.clouddragon.huawei.com/secguard/tool/engine/gsm/tasks) 、 [SecVas](https://secguard-szv.clouddragon.huawei.com/secguard/tool/engine/secvas/tasks) | RL-14.1.1-1、RL-14.1.2-1、RL-2.1.1-1、RL-2.1.2-1 |
| 账号验证智能体 | 产品文档（包含用户清单）或单独用户清单Excel表格。产品文档参考 [模板](https://w3.huawei.com/pdmcplus/#/workflowAssets/detail/zh_CN/5/BI0000008714001/3?treeId=b82c9570-3c06-11e8-2d5f-286ed48992c2) | RL-5.1.1-3 |
| 安全资料验证智能体 | 产品文档，一般是 CHM 格式文件或 Word 文档。文件名需包括"产品文档"或"产品资料"关键字 | RL-9.1.4-1、RL-9.1.5-1 |
| 日志验证智能体           | 从系统管理面导出的系统日志文件，参考模板《日志文件模板-Log_File.zip》                        | RL-8.1.2-1、RL-8.1.2-2、RL-8.1.2-3 |
`;
