import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createQueryClient } from "@/lib/query";
import { createAppRouter } from "@/router";
import "@/styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root missing from index.html");
// 单独赋值：让窄化结果进入下面的 async 闭包（TS 不会对闭包里的可变引用保持窄化）。
const container: HTMLElement = rootElement;

const router = createAppRouter();
const queryClient = createQueryClient();

async function start(): Promise<void> {
  // 先完成首次匹配：否则 hydration 首帧可能渲染 pending 骨架，和预渲染 HTML 对不上。
  await router.load();
  hydrateRoot(
    container,
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
