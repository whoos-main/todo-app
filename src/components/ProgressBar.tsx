export function ProgressBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="progress">
      <span className="progress-label">{label}</span>
      {value === null ? (
        <span className="progress-empty">할 일 없음</span>
      ) : (
        <>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`${label} 진행률`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <div className="progress-fill" style={{ width: `${value}%` }} />
          </div>
          <span className="progress-value">{value}%</span>
        </>
      )}
    </div>
  );
}
