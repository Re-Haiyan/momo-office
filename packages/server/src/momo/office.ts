import { terminal, Store } from "./store";
import { officeLayout, findOfficePath, Point } from "./OfficeLayout";
export type OfficeAgent = {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: string;
  action: string;
  currentTask: string;
  thought: string;
};
export class OfficeSimulation {
  private agents = new Map<string, OfficeAgent>();
  private routes = new Map<string, { target: string; steps: Point[] }>();
  constructor(
    private engine: {
      store: Store;
      activity: (id: string) => {
        action: string;
        task: string;
        thought: string;
      };
    },
  ) {}
  snapshot() {
    const team = this.engine.store.agents;
    const ids = new Set(team.map((a) => a.id));
    for (const id of this.agents.keys())
      if (!ids.has(id)) {
        this.agents.delete(id);
        this.routes.delete(id);
      }
    const run = this.engine.store.runs.find(
      (r) => !terminal(r) && r.status !== "queued",
    );
    const meeting = run && ["planning", "reviewing"].includes(run.status);

    team.forEach((agent, index) => {
      const desk = officeLayout.desks[index];
      let state = this.agents.get(agent.id);
      if (!state) {
        state = {
          id: agent.id,
          name: agent.name,
          x: desk.x,
          y: desk.y,
          direction: "down",
          action: "idle",
          currentTask: "",
          thought: "",
        };
        this.agents.set(agent.id, state);
        state.x = desk.x;
        state.y = desk.y;
      }
      const activity = this.engine.activity(agent.id);
      let target = desk,
        action = activity.action,
        thought = activity.thought;
      if (meeting) {
        target = officeLayout.meetingSeats[index];
        action = "talk";
        thought =
          run.status === "planning"
            ? agent.id === "momo"
              ? "Meeting: planning and handing out assignments"
              : "Meeting: listening to Momo’s plan"
            : "Meeting: reviewing the team’s work";
      } else if (activity.action !== "work" && agent.id !== "momo") {
        const choice = (Math.floor(Date.now() / 90000) + index) % 3;
        const seats = [
          officeLayout.coffeeSeats,
          officeLayout.loungeSeats,
          officeLayout.readingSeats,
        ][choice];
        target = seats[Math.floor(index / 3) % seats.length];
        thought = [
          "Taking a coffee break",
          "Recharging in the lounge",
          "Reading in the quiet corner",
        ][choice];
      }
      const key = `${target.x},${target.y}`;
      let route = this.routes.get(agent.id);
      if (!route || route.target !== key) {
        route = {
          target: key,
          steps: findOfficePath({ x: state.x, y: state.y }, target),
        };
        this.routes.set(agent.id, route);
      }
      const next = route.steps.shift();
      if (next) {
        state.direction =
          next.x > state.x
            ? "right"
            : next.x < state.x
              ? "left"
              : next.y > state.y
                ? "down"
                : "up";
        state.x = next.x;
        state.y = next.y;
      }
      state.name = agent.name;
      state.action = next ? "move" : action;
      state.currentTask = activity.task;
      state.thought = thought;
    });
    return {
      agents: [...this.agents.values()].map((a) => ({ ...a })),
      officeTime: new Date().toISOString(),
    };
  }
}
