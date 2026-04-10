import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { PublicLanguageSwitcher } from "./PublicLanguageSwitcher";

describe("PublicLanguageSwitcher", () => {
  beforeEach(async () => {
    localStorage.removeItem("lang");
    await i18n.changeLanguage("en");
  });

  it("renders a language group labeled for assistive tech", async () => {
    const user = userEvent.setup();
    render(<PublicLanguageSwitcher />);
    expect(screen.getByRole("group", { name: /language/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { expanded: false }));
    const region = screen.getByRole("region", { name: /language/i });
    expect(within(region).getByText("English")).toBeInTheDocument();
    expect(within(region).getByText("Polski")).toBeInTheDocument();
  });

  it("marks the active locale with aria-pressed", async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage("cs");
    render(<PublicLanguageSwitcher />);
    await user.click(screen.getByRole("button", { expanded: false }));
    const region = screen.getByRole("region", { name: /language|jazyk/i });
    const csBtn = within(region).getByRole("button", { name: /Čeština/i });
    expect(csBtn).toHaveAttribute("aria-pressed", "true");
    const enBtn = within(region).getByRole("button", { name: /English/i });
    expect(enBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("changes i18n language and persists localStorage when a locale is chosen", async () => {
    const user = userEvent.setup();
    render(<PublicLanguageSwitcher />);

    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(screen.getByRole("button", { name: /Polski/i }));

    await waitFor(() => {
      expect(i18n.language.startsWith("pl")).toBe(true);
    });
    expect(localStorage.getItem("lang")).toBe("pl");
  });
});
