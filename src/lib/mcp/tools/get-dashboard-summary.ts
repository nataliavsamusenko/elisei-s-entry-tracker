import { defineTool } from "@lovable.dev/mcp-js";
import { getDashboardData } from "../../../data/applications";

export default defineTool({
  name: "get_dashboard_summary",
  title: "Сводка дашборда",
  description:
    "Возвращает общую сводку по поступлению Елисея (№1431604): мета-информацию, покрытие списками по вузам и агрегаты (получено списков, бюджет/платное, стадия конкурса).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const data = await getDashboardData();
    return {
      content: [{ type: "text", text: JSON.stringify({ meta: data.meta, coverage: data.coverage }, null, 2) }],
      structuredContent: { meta: data.meta, coverage: data.coverage },
    };
  },
});
