'use client';

export function PrintButton() {
  return (
    <button type="button" className="btn mt-6 print:hidden" onClick={() => window.print()}>
      Print
    </button>
  );
}
