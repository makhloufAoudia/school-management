// Un « template » est recréé à chaque changement de page (contrairement au
// layout) : on en profite pour une entrée en fondu, courte et discrète.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
