export function MemberArrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={up ? "M7 17 17 7M7 7h10v10" : "M4 12h16m-6-6 6 6-6 6"} />
    </svg>
  );
}
