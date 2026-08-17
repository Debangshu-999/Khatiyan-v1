import type { ManagerAccessLevel, ManagerResource } from "@/store/services/property-api";

/**
 * How permissions are presented to an owner: modules → sections → screens.
 *
 * The stored model is flat — one level per resource — because that is what the
 * server checks. This shape exists only in the UI, as the way an owner thinks:
 *
 * - **Module off** → not shown at all. Stored as NONE on every screen in it.
 * - **Module on** → appears in their workspace; each screen is then set.
 *
 * Sections group screens inside a module (Tenancy has tools, rules and stays).
 * A module with one unnamed section is the simple case and renders flat.
 */
export type AccessScreen = {
  description: string;
  label: string;
  // Some screens have no meaningful view-only state — creating a tenancy is the
  // clear case, since there is nothing to read on a form you cannot submit.
  // Those offer Blocked / View & manage only.
  noViewOnly?: boolean;
  // The inverse: a screen that cannot be shut off individually, only read or
  // read-and-change. The property screens are these — a manager who cannot even
  // look at the room list has no reason to open the module, and the module
  // toggle already says "none of this". Offering Blocked as well would be a
  // second off switch for the same thing.
  noBlocked?: boolean;
  // Set when the level is owned by ANOTHER module. The row then shows the
  // current level as a fact and points at where to change it, instead of
  // offering a second control for the same grant — two switches for one value
  // is how they end up disagreeing.
  derivedFrom?: string;
  resource: ManagerResource;
};

export type AccessSection = {
  // How a blocked screen behaves for the manager. "toast" refuses to open it;
  // "message" lets them in and explains inside. Destinations get a toast; a
  // panel they are already looking at gets a message, because refusing to open
  // something already on screen makes no sense.
  blockedBehaviour: "toast" | "message";
  // Undefined for a module whose screens need no grouping.
  label?: string;
  screens: AccessScreen[];
};

export type AccessModule = {
  description: string;
  key: string;
  label: string;
  // False until the module's backend checks have been converted. Unmanageable
  // modules are not offered — letting an owner switch off something that still
  // works everywhere would be a lie.
  manageable: boolean;
  sections: AccessSection[];
};

export const ACCESS_MODULES: AccessModule[] = [
  {
    key: "concern",
    label: "Concerns",
    description: "The tenant concern queue.",
    manageable: true,
    sections: [
      {
        blockedBehaviour: "message",
        screens: [
          {
            resource: "CONCERNS",
            label: "Concern queue",
            description: "Raised issues, assignment, status and resolution.",
          },
        ],
      },
    ],
  },
  {
    key: "tenancy",
    label: "Tenancy",
    description: "Stays, tools and the rules a stay runs under.",
    manageable: true,
    sections: [
      {
        label: "Tenancy tools",
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "TENANCY_CREATE",
            label: "Create tenancy",
            description: "Onboarding a new tenant.",
            noViewOnly: true,
          },
          { resource: "EXIT_REQUESTS", label: "Exit requests", description: "Reviewing and deciding move-outs." },
          { resource: "ROOM_CHANGES", label: "Room change", description: "Reviewing and deciding room-change requests." },
        ],
      },
      {
        label: "Tenancy rules",
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "TENANCY_RULES",
            label: "Agreement & exit policies",
            description: "Whether an agreement is required, its terms, the damage schedule and the move-out checklist.",
          },
        ],
      },
      {
        label: "Property stays",
        blockedBehaviour: "message",
        screens: [
          {
            resource: "TENANCIES",
            label: "Active & past tenancies",
            description: "The stay list and a tenant's profile. Manage also allows ending a stay.",
          },
        ],
      },
    ],
  },
  {
    key: "billing",
    label: "Billing",
    description: "Bills, payments and deposits.",
    manageable: true,
    sections: [
      {
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "BILLING_CYCLES",
            label: "Bills, payments & billing tools",
            description:
              "Billing cycles plus every billing tool — payment history, tenant bills, upcoming cycles and the monthly report. Manage also allows recording payment, one-off bills and line items.",
          },
          {
            resource: "DEPOSITS",
            label: "Deposits & deposit manager",
            description:
              "The deposit manager and deposit history: ledger, balances and movements. Manage also allows corrections and settling a deposit. Ending a stay never needs this — the deposit is left pending settlement.",
          },
        ],
      },
    ],
  },
  {
    key: "money",
    label: "Tools",
    description: "The utilities on their home screen.",
    manageable: true,
    sections: [
      {
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "EXPENSES",
            label: "Expenses & budget",
            description: "Expense ledger, categories, budget and recurring spend.",
            noViewOnly: true,
          },
          {
            resource: "PNL",
            label: "Profit & loss",
            description: "Income against expenses, and the trend.",
            noViewOnly: true,
          },
          {
            resource: "VACANCY_FINDER",
            label: "Vacancy finder",
            description: "Matching free beds to requirements. Controls whether the tool appears, not what it can read — the rooms and stays behind it follow their own permissions.",
            noViewOnly: true,
          },
          {
            derivedFrom: "Billing",
            resource: "DEPOSITS",
            label: "Deposit manager",
            description: "Follows the Deposits permission in Billing, because it is the same screen reached another way.",
          },
        ],
      },
    ],
  },
  {
    key: "property",
    label: "Property",
    description: "Rooms, settings, board and surroundings.",
    manageable: true,
    sections: [
      {
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "PROPERTY_SETTINGS",
            label: "Property & listing",
            description:
              "Property details and the public listing. View-only greys out Edit property and the listing controls; manage allows both.",
            noBlocked: true,
          },
          {
            resource: "ROOMS",
            label: "Rooms & beds",
            description: "Room inventory and occupancy. View-only greys out Add room and Add in bulk.",
            noBlocked: true,
          },
          {
            resource: "PROPERTY_BOARD",
            label: "Property board",
            description: "The board tenants browse. View-only greys out adding, editing and removing items.",
            noBlocked: true,
          },
          {
            resource: "NEARBY_PLACES",
            label: "Nearby places",
            description: "Curated landmarks and services. View-only greys out managing places.",
            noBlocked: true,
          },
        ],
      },
    ],
  },
  {
    key: "operations",
    label: "Notices",
    description: "Announcements to tenants.",
    manageable: true,
    sections: [
      {
        blockedBehaviour: "toast",
        screens: [
          {
            resource: "NOTICES",
            label: "Notices",
            description:
              "One-off and recurring notices. View-only reads the list and archive; manage adds publishing, editing and scheduling.",
          },
        ],
      },
    ],
  },
];

export function moduleScreens(module: AccessModule): AccessScreen[] {
  return module.sections.flatMap((section) => section.screens);
}

/** A module is ON when any screen inside it is granted. */
export function isModuleOn(
  module: AccessModule,
  levels: Partial<Record<ManagerResource, ManagerAccessLevel>>,
): boolean {
  return moduleScreens(module)
    .filter((screen) => !screen.derivedFrom)
    .some((screen) => (levels[screen.resource] ?? "NONE") !== "NONE");
}

/**
 * Turning a module on grants the least power that still makes it worth showing —
 * VIEW, or MANAGE for a screen that has no view-only state. The owner then
 * raises or drops individual screens.
 */
export function applyModuleToggle(
  module: AccessModule,
  on: boolean,
  levels: Partial<Record<ManagerResource, ManagerAccessLevel>>,
): Partial<Record<ManagerResource, ManagerAccessLevel>> {
  const next = { ...levels };
  for (const screen of moduleScreens(module)) {
    // A derived row belongs to another module; toggling this one must not
    // silently revoke a grant the owner made over there.
    if (screen.derivedFrom) {
      continue;
    }
    next[screen.resource] = on ? (screen.noViewOnly ? "MANAGE" : "VIEW") : "NONE";
  }
  return next;
}

export const MANAGEABLE_MODULES = ACCESS_MODULES.filter((module) => module.manageable);

/**
 * Everything an owner grants when they skip configuration at onboarding.
 *
 * <p>
 * Only the modules they were actually shown. Granting every resource in the
 * enum would hand over modules the permission screen has never listed — power
 * over deposits and settlements that the owner was never asked about — and
 * "skip" is not consent to something you were not shown.
 *
 * <p>
 * A module converted later therefore lands at NONE and waits for a deliberate
 * decision, which is the correct default for a capability that has only just
 * become governable.
 */
export function fullAccessLevels(): Partial<Record<ManagerResource, ManagerAccessLevel>> {
  const levels: Partial<Record<ManagerResource, ManagerAccessLevel>> = {};
  for (const module of MANAGEABLE_MODULES) {
    for (const screen of moduleScreens(module)) {
      levels[screen.resource] = "MANAGE";
    }
  }
  return levels;
}
export const PENDING_MODULES = ACCESS_MODULES.filter((module) => !module.manageable);
