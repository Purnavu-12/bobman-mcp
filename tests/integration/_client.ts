import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function connectTestClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "bobman-test-client", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

export async function parseToolResult<T>(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): Promise<T> {
  const text = result.content[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as T & { code?: string };
  if (result.isError) {
    throw new Error(text);
  }
  return parsed as T;
}
