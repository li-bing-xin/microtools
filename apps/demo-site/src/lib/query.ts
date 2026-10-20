import { QueryClient, queryOptions } from "@tanstack/react-query";

export interface ToolFact {
  label: string;
  value: string;
}

/**
 * 静态站没有后端：queryFn 先返回本地常量。
 *
 * initialData + staleTime: Infinity 让 SSR 与 hydration 首帧拿到完全一样的数据，
 * 不会出现「服务端渲染 loading、客户端渲染列表」的 hydration mismatch。
 * 将来接后端时：去掉 initialData/staleTime，在 route loader 里
 * queryClient.ensureQueryData(...) 预取，再 dehydrate/hydrate 即可。
 */
const TOOL_FACTS: ToolFact[] = [
  { label: "Runs in", value: "Your browser" },
  { label: "Files uploaded", value: "None" },
  { label: "Account needed", value: "No" },
];

export const toolFactsQuery = queryOptions({
  queryKey: ["tool-facts"],
  queryFn: async (): Promise<ToolFact[]> => TOOL_FACTS,
  initialData: TOOL_FACTS,
  staleTime: Number.POSITIVE_INFINITY,
});

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
