import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadRoute } from "../../../routes/UploadRoute";
import { DropZone } from "../DropZone";
import { ReadingBoard } from "../ReadingBoard";
import { ReadingLog } from "../ReadingLog";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("shows public demo banner and disables upload when API reports demo_only=true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", demo_only: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UploadRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const statusBox = await screen.findByRole("status");
    expect(statusBox).toHaveTextContent("Public demo mode is active");
    expect(screen.getByRole("link", { name: /Open IIT Hyderabad joint/i })).toHaveAttribute(
      "href",
      "/demo/iit",
    );
    expect(screen.getByRole("link", { name: /Open worked example/i })).toHaveAttribute(
      "href",
      "/demo",
    );
    expect(screen.getByLabelText(/Choose structural PDF file/i)).toBeDisabled();
  });

  it("rejects non-PDF files and invalid page specs client-side before uploading", () => {
    const onSelectPdf = vi.fn();
    function Harness() {
      const [pagesSpec, setPagesSpec] = useState("");
      return (
        <MemoryRouter>
          <DropZone
            pagesSpec={pagesSpec}
            onPagesSpecChange={setPagesSpec}
            onSelectPdf={onSelectPdf}
            errorText={null}
          />
        </MemoryRouter>
      );
    }

    render(<Harness />);

    const fileInput = screen.getByLabelText(/Choose structural PDF file/i);
    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(onSelectPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Only PDF drawing sets (.pdf) are accepted.");

    const pagesInput = screen.getByLabelText(/Pages \(optional\)/i);
    const uploadBtn = screen.getByRole("button", { name: /Upload a drawing set/i });

    fireEvent.change(pagesInput, { target: { value: "banana" } });
    expect(pagesInput).toHaveAttribute("aria-invalid", "true");
    expect(uploadBtn).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter page numbers or ranges/i);

    fireEvent.change(pagesInput, { target: { value: "10-5" } });
    expect(pagesInput).toHaveAttribute("aria-invalid", "true");
    expect(uploadBtn).toBeDisabled();

    fireEvent.change(pagesInput, { target: { value: "7-9,15-21" } });
    expect(pagesInput).toHaveAttribute("aria-invalid", "false");
    expect(uploadBtn).toBeEnabled();

    const pdfFile = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    expect(onSelectPdf).toHaveBeenCalledWith(pdfFile);
  });
});
