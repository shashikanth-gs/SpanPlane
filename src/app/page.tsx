import A2AWorkbench from "@/components/A2AWorkbench";
import { DemoLanding } from "@/components/DemoLanding";

export default function Home() {
  return process.env.A2A_DEPLOYMENT_MODE === "demo" ? <DemoLanding /> : <A2AWorkbench />;
}
