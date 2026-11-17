import { NavLink, Navigate, Route, Routes } from "react-router";
import { GoalsSection } from "./GoalsSection";
import { IdeasSection } from "./IdeasSection";
import { OverviewSection } from "./OverviewSection";
import { ProjectsSection } from "./ProjectsSection";
import { TasksSection } from "./TasksSection";

const SECTIONS = [
  { path: "overview", label: "Översikt" },
  { path: "ideas", label: "Idébank" },
  { path: "goals", label: "Mål" },
  { path: "projects", label: "Projekt" },
  { path: "tasks", label: "Uppgifter" },
] as const;

export const PlanningPage = () => (
  <div className="mx-auto mt-4 max-w-5xl space-y-4 px-4 pb-8">
    <h2 className="text-2xl font-semibold">Planering</h2>
    <nav className="flex gap-1 overflow-x-auto border-b">
      {SECTIONS.map((s) => (
        <NavLink
          key={s.path}
          to={`/planning/${s.path}`}
          className={({ isActive }) =>
            `shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm sm:py-2 font-medium no-underline transition-colors ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
    <Routes>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<OverviewSection />} />
      <Route path="ideas" element={<IdeasSection />} />
      <Route path="goals" element={<GoalsSection />} />
      <Route path="projects" element={<ProjectsSection />} />
      <Route path="tasks" element={<TasksSection />} />
    </Routes>
  </div>
);
