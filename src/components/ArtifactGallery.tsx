"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, PackageOpen } from "lucide-react";
import type { AssembledArtifact } from "@/lib/workbench-types";
import { PartRenderer } from "./PartRenderer";

export function ArtifactGallery({ artifacts }: { artifacts: AssembledArtifact[] }) {
  const [active, setActive] = useState(0);
  if (!artifacts.length) return null;
  const artifact = artifacts[Math.min(active, artifacts.length - 1)];
  return (
    <section className="artifact-gallery">
      <header><div><PackageOpen size={17} />Artifacts <span>{artifacts.length}</span></div></header>
      {artifacts.length > 1 && <div className="artifact-tabs" role="tablist">{artifacts.map((item, index) => <button role="tab" aria-selected={index === active} className={index === active ? "active" : ""} key={item.artifactId} onClick={() => setActive(index)}>{item.name || `Artifact ${index + 1}`}</button>)}</div>}
      <div className="artifact-heading"><div><strong>{artifact.name || "Untitled artifact"}</strong>{artifact.description && <p>{artifact.description}</p>}</div><span className={artifact.complete ? "complete" : "streaming"}>{artifact.complete ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} />}{artifact.complete ? "Complete" : "Streaming"}</span></div>
      <div className="artifact-parts">{artifact.parts.map((part, index) => <PartRenderer key={`${artifact.artifactId}-${part.id}-${index}`} part={part} />)}</div>
    </section>
  );
}
