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

// 将 GFM 表格单元格内的“真实换行”合并为 <br>。
//
// GFM 规定：一整行表格必须位于同一物理行。但报告生成端常在单元格里直接写入
// 换行符（例如红线条款的“正文要求 / 红线解读”这类多段落内容），导致 remark-gfm
// 把一行表格行拆成多行，后续内容错位到别的单元格。这里在渲染前把「一行表格行」
// 重新拼回单行：以表头的未转义竖线数量作为该表的列分隔基准，逐个物理行累加，
// 未达到基准的行视为上一行的单元格内换行，用 <br> 连接（<br> 是 GFM 单元格内
// 唯一合法的换行表示，且在默认 sanitize schema 白名单内）。
export function fixTableCellLineBreaks(md: string): string {
  if (!md || md.indexOf('|') === -1) return md;

  const lines = md.split('\n');
  const out: string[] = [];

  // 统计未转义竖线数量（\| 不计入）
  const countPipes = (s: string): number => {
    let n = 0;
    for (let k = 0; k < s.length; k++) {
      if (s[k] === '|' && (k === 0 || s[k - 1] !== '\\')) n += 1;
    }
    return n;
  };
  // 分隔行，如 |:---|:---:|---:| 或 | --- | --- |
  const isDelimiterRow = (s: string): boolean =>
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(s);
  const isHeading = (s: string): boolean => /^\s*#{1,6}\s/.test(s);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    // 表头行（含竖线）紧跟分隔行 => 进入表体处理
    if (next !== undefined && line.includes('|') && isDelimiterRow(next)) {
      const expectedPipes = countPipes(line);
      out.push(line);
      out.push(next);
      i += 2;

      while (i < lines.length) {
        const rowStart = lines[i];
        // 空行 / 标题 / 新的分隔行都表示表格结束
        if (rowStart.trim() === '' || isHeading(rowStart) || isDelimiterRow(rowStart)) break;

        let buf = rowStart;
        i += 1;
        // 竖线数不足说明这一行尚未闭合，把后续物理行作为单元格内换行合并进来
        while (
          countPipes(buf) < expectedPipes &&
          i < lines.length &&
          lines[i].trim() !== '' &&
          !isHeading(lines[i]) &&
          !isDelimiterRow(lines[i])
        ) {
          buf += '<br>' + lines[i].trim();
          i += 1;
        }
        out.push(buf);
      }
    } else {
      out.push(line);
      i += 1;
    }
  }

  return out.join('\n');
}
