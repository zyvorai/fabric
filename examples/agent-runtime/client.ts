import { Fabric } from "@zyvor/fabric-agent";

const fabric = new Fabric({
  baseUrl: process.env.FABRIC_AGENT_URL,
  token: process.env.FABRIC_AGENT_TOKEN,
});

const session = await fabric.agent("research-agent").run({
  prompt: "Compare KVM and Firecracker isolation for untrusted agents.",
});

for await (const event of session.events()) {
  console.log(event.kind, event.data);
}
