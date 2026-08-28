import { resetButtonClass } from "../lib/Styles";

export default function ResetButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Reset to default"
      className={resetButtonClass}
    >
      Reset
    </button>
  );
}
