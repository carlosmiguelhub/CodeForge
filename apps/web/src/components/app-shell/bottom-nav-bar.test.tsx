import { fireEvent, render, screen, within } from "@testing-library/react";
import { GraduationCap, LayoutList, Users } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { BottomNavBar } from "./bottom-nav-bar";
import {
  ClassBottomNavProvider,
  usePublishClassBottomNav,
  type ClassBottomNavConfig,
} from "./class-bottom-nav-context";

function Publisher({ config }: Readonly<{ config: ClassBottomNavConfig }>) {
  usePublishClassBottomNav(config);
  return null;
}

function renderInClass(config: ClassBottomNavConfig) {
  return render(
    <ClassBottomNavProvider>
      <Publisher config={config} />
      <BottomNavBar
        role="student"
        activeHref="/student/classes/abc"
        moreOpen={false}
        onMoreClick={vi.fn()}
      />
    </ClassBottomNavProvider>,
  );
}

const fourTabConfig: ClassBottomNavConfig = {
  backHref: "/student/classes",
  backLabel: "My Classes",
  tabs: [
    { id: "classwork", label: "Classwork", icon: LayoutList },
    { id: "quizzes", label: "Quizzes", icon: LayoutList },
    { id: "races", label: "Code Racing", icon: LayoutList },
    { id: "scores", label: "My Scores", icon: LayoutList },
  ],
  activeTab: "classwork",
  onTabChange: vi.fn(),
};

const fiveTabConfig: ClassBottomNavConfig = {
  backHref: "/teacher/classes",
  backLabel: "My Classes",
  tabs: [
    { id: "classwork", label: "Classwork", icon: LayoutList },
    { id: "quizzes", label: "Quizzes", icon: LayoutList },
    { id: "races", label: "Code Racing", icon: LayoutList },
    { id: "scores", label: "Student Scores", icon: GraduationCap },
    { id: "people", label: "People · 3", icon: Users },
  ],
  activeTab: "classwork",
  onTabChange: vi.fn(),
};

describe("BottomNavBar in class context", () => {
  it("falls back to the global nav when no class has published a config", () => {
    render(
      <ClassBottomNavProvider>
        <BottomNavBar
          role="student"
          activeHref="/student"
          moreOpen={false}
          onMoreClick={vi.fn()}
        />
      </ClassBottomNavProvider>,
    );

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });

  it("shows the class's own tabs instead of the global nav once published", () => {
    renderInClass(fourTabConfig);

    const nav = screen.getByRole("navigation", { name: "Class" });
    expect(
      within(nav).getByRole("button", { name: "Classwork" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("button", { name: "My Scores" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });

  it("fires onTabChange when a visible tab is tapped", () => {
    const onTabChange = vi.fn();
    renderInClass({ ...fourTabConfig, onTabChange });

    fireEvent.click(screen.getByRole("button", { name: "Code Racing" }));
    expect(onTabChange).toHaveBeenCalledWith("races");
  });

  it("shows exactly 4 tabs plus More when there are only 4 tabs, with no overflow items", () => {
    renderInClass(fourTabConfig);

    const nav = screen.getByRole("navigation", { name: "Class" });
    expect(within(nav).getAllByRole("button")).toHaveLength(5); // 4 tabs + More

    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    expect(
      screen.getByRole("link", { name: /My Classes/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Main menu" })).toBeInTheDocument();
  });

  it("tucks the 5th+ tab behind More for a 5-tab (teacher) config", () => {
    renderInClass(fiveTabConfig);

    const nav = screen.getByRole("navigation", { name: "Class" });
    expect(
      within(nav).queryByRole("button", { name: /People/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    expect(
      screen.getByRole("button", { name: "People · 3" }),
    ).toBeInTheDocument();
  });

  it("navigates to the overflow tab and closes the menu when picked from More", () => {
    const onTabChange = vi.fn();
    renderInClass({ ...fiveTabConfig, onTabChange });

    const nav = screen.getByRole("navigation", { name: "Class" });
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "People · 3" }));

    expect(onTabChange).toHaveBeenCalledWith("people");
    expect(
      screen.queryByRole("button", { name: "People · 3" }),
    ).not.toBeInTheDocument();
  });

  it("closes the More menu on an outside click", () => {
    renderInClass(fiveTabConfig);

    const nav = screen.getByRole("navigation", { name: "Class" });
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    expect(
      screen.getByRole("button", { name: "Main menu" }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("button", { name: "Main menu" }),
    ).not.toBeInTheDocument();
  });

  it("opens the global sidebar menu from Main menu inside the class overflow", () => {
    const onMoreClick = vi.fn();
    render(
      <ClassBottomNavProvider>
        <Publisher config={fiveTabConfig} />
        <BottomNavBar
          role="teacher"
          activeHref="/teacher/classes/abc"
          moreOpen={false}
          onMoreClick={onMoreClick}
        />
      </ClassBottomNavProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Main menu" }));
    expect(onMoreClick).toHaveBeenCalledOnce();
  });

  it("clears the class config and restores the global nav on unmount", () => {
    function Wrapper({ showClass }: Readonly<{ showClass: boolean }>) {
      return (
        <ClassBottomNavProvider>
          {showClass ? <Publisher config={fourTabConfig} /> : null}
          <BottomNavBar
            role="student"
            activeHref="/student"
            moreOpen={false}
            onMoreClick={vi.fn()}
          />
        </ClassBottomNavProvider>
      );
    }

    const { rerender } = render(<Wrapper showClass />);
    expect(
      screen.getByRole("navigation", { name: "Class" }),
    ).toBeInTheDocument();

    rerender(<Wrapper showClass={false} />);
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });
});
