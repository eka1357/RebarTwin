import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "../DropZone";
import { ReadingBoard } from "../ReadingBoard";
import { ReadingLog } from "../ReadingLog";

describe("W8 Reading & Upload", () => {
  it("renders starter chips, labelled page filter, and selects PDF file", () => {
    const onSelectPdf = vi.fn();
    const onPagesSpecChange = vi.fn();

    render(
      <MemoryRouter>
        <DropZone
          pagesSpec="1,7"
          onPagesSpecChange={onPagesSpecChange}
          onSelectPdf={onSelectPdf}
          errorText={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Try the example joint/i })).toBeInTheDocument();
    const pagesInput = screen.getByLabelText(/Pages \(optional\)/i);
    fireEvent.change(pagesInput, { target: { value: "1,7,10" } });
    expect(onPagesSpecChange).toHaveBeenCalledWith("1,7,10");

    const fileInput = screen.getByLabelText(/Choose structural PDF file/i);
    const file = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onSelectPdf).toHaveBeenCalledWith(file);
  });

  it("renders ReadingBoard tiles with reduced-motion Progress fallback and polite live region", () => {
    render(
      <ReadingBoard
        totalPages={3}
        liveAnnouncement="Page 1: 12 agreed, 2 to check."
        pages={[
          { page: 1, status: "done", agreed: 12, toCheck: 2, ocrWords: 140, ocrRepairs: 1 },
          { page: 2, status: "reading" },
          { page: 3, status: "queued", needsOcr: true },
        ]}
      />,
    );

    expect(screen.getByText(/Reading sheets \(1 of 3\)/i)).toBeInTheDocument();
    expect(screen.getByText("Agreed")).toBeInTheDocument();
    expect(screen.getByText(/140 words · 1 repaired/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 1: 12 agreed, 2 to check\./i)).toBeInTheDocument();
    expect(screen.getByLabelText("Page 2 reading in progress")).toBeInTheDocument();
  });

  it("renders ReadingLog with role='log' newest entries cleanly", () => {
    render(
      <ReadingLog
        entries={[
          { id: "1", timestamp: "10:00:01", kind: "info", message: "Page 1 started" },
          { id: "2", timestamp: "10:00:04", kind: "joint", message: "Joint C4xB12 checked" },
        ]}
      />,
    );

    const logEl = screen.getByRole("log");
    expect(logEl).toHaveTextContent("Page 1 started");
    expect(logEl).toHaveTextContent("Joint C4xB12 checked");
  });
});
