import { defaultSchema } from 'rehype-sanitize';

// 结果报告 markdown 的清洗 schema：
// 在 rehype-sanitize 默认安全 schema 基础上，放行智能体返回内容里常用的内联样式
// （style/class/color 等属性与 span/font 等排版标签），使 HTML 样式得以渲染；
// 同时仍由默认 schema 过滤 <script>、on* 事件属性、javascript: 协议等 XSS 注入向量。
export const reportSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'span', 'font', 'div', 'u', 'mark', 'small', 'sub', 'sup', 'center',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...((defaultSchema.attributes && defaultSchema.attributes['*']) || []),
      'style', 'className', 'class', 'color', 'align', 'width',
    ],
    font: ['color', 'size', 'face'],
  },
};
