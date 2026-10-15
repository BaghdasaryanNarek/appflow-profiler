import type { Metadata } from "next";
import { ProcessesView } from "./ProcessesView";

export const metadata: Metadata = {
  title: "Processes | AppFlow Profiler",
  description: "Tabular view of observed operating system processes and active socket connections",
};

export default function ProcessesPage() {
  return <ProcessesView />;
}
