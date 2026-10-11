// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import { jumpToSection, Section } from "../src/hub/ui";

function mount(el: React.ReactElement) { const host = document.createElement("div"); document.body.appendChild(host); act(() => { ReactDOM.render(el, host); }); return host; }

describe("guided sections", () => {
  it("sections that need attention start open, finished and unused ones start closed", () => {
    const host = mount(<>
      <Section id="a" no={1} title="A" help="a" status="todo"><p id="body-a">A body</p></Section>
      <Section id="b" no={2} title="B" help="b" status="ok"><p id="body-b">B body</p></Section>
      <Section id="c" no={3} title="C" help="c" status="off"><p id="body-c">C body</p></Section>
      <Section id="d" no={4} title="D" help="d" status="ok" open><p id="body-d">D body</p></Section>
    </>);
    expect(host.querySelector("#body-a")).toBeTruthy();
    expect(host.querySelector("#body-b")).toBeNull();
    expect(host.querySelector("#body-c")).toBeNull();
    expect(host.querySelector("#body-d")).toBeTruthy();
    expect(host.textContent).toContain("Needs attention");
    expect(host.textContent).toContain("Done");
    expect(host.textContent).toContain("Not used");
  });
  it("a click toggles, and jumping to a section opens it", () => {
    const host = mount(<Section id="x" no={1} title="X" help="x" status="ok"><p id="body-x">X body</p></Section>);
    expect(host.querySelector("#body-x")).toBeNull();
    const head = host.querySelector("button.sect-head") as HTMLButtonElement;
    expect(head.getAttribute("aria-expanded")).toBe("false");
    act(() => { jumpToSection("x"); });
    expect(host.querySelector("#body-x")).toBeTruthy();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    act(() => { jumpToSection("other"); });
    expect(host.querySelector("#body-x")).toBeTruthy();                 // unrelated ids change nothing
  });
});
