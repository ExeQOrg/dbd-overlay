import { headingClass } from "../lib/Styles";

export default function PageHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-2">
      <h1 className={headingClass}>{children}</h1>
      <span className="h-[3px] w-10 bg-blood" />
    </div>
  );
}
