import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeCitation } from "./CodeCitation";

const citation = {
  document_id: "didi-build/launchpad/src/index.ts",
  chunk_index: 55,
  knowledge_source_id: "ks-1",
  excerpt: "export default worker;",
};

describe("CodeCitation", () => {
  it("strips didi-build prefix and toggles excerpt", () => {
    render(<CodeCitation citation={citation} defaultOpen />);
    expect(screen.getByText(/launchpad\/src\/index\.ts/)).toBeTruthy();
    expect(screen.getByText("L56:56")).toBeTruthy();
    expect(screen.getByText("export default worker;")).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("export default worker;")).toBeNull();
  });
});
