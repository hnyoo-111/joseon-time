export function YearSplash({ show, year, subtitle }: { show: boolean; year: string; subtitle: string }) {
  return (
    <div className={'year-splash' + (show ? ' show' : '')}>
      <div className="ys-year">{year}</div>
      <div className="ys-title">{subtitle}</div>
    </div>
  );
}
