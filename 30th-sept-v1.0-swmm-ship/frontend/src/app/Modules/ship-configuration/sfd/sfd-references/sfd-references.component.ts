import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { SfdReferencesApiService } from "../services/sfd-references-api.service";
import { ShipDirectoryCommand, ShipDirectoryShip, SyncCardConfig, SyncKey } from "./sfd-references.models";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { SfdReferenceDataApiService } from "../services/sfd-reference-data-api.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { User } from "../../../../Core/services/user/user";
import { StatusChip, ChipTone, IconComponent } from "../../../../shared/components";

/** A ship the operator just picked, awaiting the "can't be changed later" confirmation. */
interface PendingShipSelection {
  uid: string;
  shipName: string;
  commandName: string;
}

const SYNC_CARDS: SyncCardConfig[] = [
  {
    key: "cmms",
    step: 1,
    title: "CMMS SFD Sync",
    color: "#1671D9",
    endpoint: "fetch-from-cmms/",
  },
  {
    key: "maintop",
    step: 2,
    title: "CMMS MAINTOPS Sync",
    color: "#1E9E5A",
    endpoint: "maintop-sync/",
  },
  {
    key: "routine",
    step: 3,
    title: "CMMS Frequency Sync",
    color: "#17A2B8",
    endpoint: "routine-sync/",
  },
  {
    key: "missingRoutine",
    step: 4,
    title: "CMMS Nomenclature wise Routines Sync",
    color: "#F0A500",
    endpoint: "missing-routine-sync/",
  },
  {
    key: "defect",
    step: 5,
    title: "Sync DARTs with CMMS (pull, then push)",
    color: "#D9364A",
    endpoint: "push-darts-to-cmms/",
  },
];

/**
 * Screen for the CMMS reference-data sync steps.
 *
 * Holds no sync state of its own — that lives in SfdReferencesApiService so a run keeps
 * going when this component is destroyed by a tab change, and this screen picks the run
 * back up when it is re-created.
 *
 * Also owns STEP 0 (Update Ship Names from CMMS): a one-time fleet-wide directory pull
 * (M_Command + M_Ship) that populates the Command/Ship Name dropdowns below, and lets an
 * operator pick the ship this install operates on. That choice is persisted server-side
 * (ActiveShipConfig) and from then on every sync step above resolves its ship from there
 * instead of the .env SWMM_SHIP_CODE.
 *
 * First-time setup is gated in a strict sequence: only Step 0 is enabled until the
 * directory has been pulled at least once (locally or in a prior session); the Command/
 * Ship Name dropdowns unlock once it has. Picking a ship in those dropdowns does NOT
 * lock it in by itself — it only stages a pending pick. STEP 1 becomes clickable as soon
 * as a ship is staged; clicking it is what raises the confirm-and-lock dialog (the choice
 * is permanent, enforced again server-side in SelectActiveShipAPI), and only on "Yes" does
 * the ship actually lock (disabling the Step 0 dropdowns) before Step 1's sync runs. Steps
 * 2-5 stay disabled until the ship is locked in, unlocking one at a time as each previous
 * step completes.
 */
@Component({
  selector: "app-sfd-references",
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, ModalComponent, StatusChip, IconComponent, ButtonComponent],
  templateUrl: "./sfd-references.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-references.component.css"],
})
export class SfdReferencesComponent implements OnInit {
  private readonly sync = inject(SfdReferencesApiService);
  private readonly sfdReferenceDataApi = inject(SfdReferenceDataApiService);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly userStore = inject(User);

  @ViewChild("logConsole") private readonly logConsole?: ElementRef<HTMLDivElement>;

  readonly syncCards = SYNC_CARDS;

  readonly runningKey = this.sync.runningKey;
  readonly progress = this.sync.progress;
  readonly currentAction = this.sync.currentAction;
  readonly itemCount = this.sync.itemCount;
  readonly logLines = this.sync.logLines;
  readonly summaries = this.sync.summaries;
  readonly isRunning = this.sync.isRunning;

  readonly shipDirectoryForm = this.fb.group({
    command: [""],
    ship: [""],
  });

  readonly pullingDirectory = signal(false);
  readonly savingSelection = signal(false);
  readonly commands = signal<ShipDirectoryCommand[]>([]);
  readonly ships = signal<ShipDirectoryShip[]>([]);
  readonly activeShipName = signal<string | null>(null);
  readonly pendingShipSelection = signal<PendingShipSelection | null>(null);
  /** Ship picked in the Step 0 dropdown but not yet confirmed via the STEP 1 dialog. */
  readonly selectedShipUid = signal("");
  /** The card whose click raised the confirm dialog — runs right after the ship locks in. */
  private readonly pendingSyncCard = signal<SyncCardConfig | null>(null);

  /** Step 2 gate. `null` = not yet asked, treated as NOT ready so the gate defaults closed
   *  rather than flashing open before the first check returns. Re-asked on load and again
   *  once Step 1 finishes, since CMMS only supplies a sub department for some equipment. */
  readonly subDeptReady = signal<boolean | null>(null);
  readonly subDeptUnassignedTotal = signal<number | null>(null);
  readonly subDeptByDepartment = signal<{ department: string; unassigned: number }[]>([]);

  /** Step 0 has produced a directory (this run or a prior one) — dropdowns can unlock. */
  readonly directoryReady = computed(() => this.commands().length > 0 || this.ships().length > 0);
  /** A ship has been confirmed — dropdowns lock permanently and Step 1 becomes reachable. */
  readonly shipLocked = computed(() => !!this.activeShipName());

  readonly commandOptions = computed<DropdownOption[]>(() =>
    this.commands().map((c) => ({
      label: c.command_name || c.command_code || `Command ${c.command_id}`,
      value: c.universal_id_m_command ?? "",
    })),
  );

  readonly shipOptions = computed<DropdownOption[]>(() => {
    const commandFilter = this.selectedCommand();
    const list = commandFilter
      ? this.ships().filter((s) => s.universal_id_m_command === commandFilter)
      : this.ships();
    return list.map((s) => ({ label: s.name, value: s.universal_id_m_ship }));
  });

  private readonly selectedCommand = signal("");

  constructor() {
    this.shipDirectoryForm.get("command")?.valueChanges.subscribe((value) => {
      this.selectedCommand.set((value as string) || "");
      this.dropShipIfOutsideCommand();
    });
    this.shipDirectoryForm.get("ship")?.valueChanges.subscribe((value) => {
      this.selectedShipUid.set((value as string) || "");
    });

    // [disabled] on app-select-input alone left the clear ("X") button and open-on-click
    // still fully interactive. Driving the FormControls' own disabled state directly is what
    // makes Angular re-invoke setDisabledState() on the CVA — the one propagation path that's
    // actually guaranteed to fire.
    effect(() => {
      const shouldDisable = !this.directoryReady() || this.shipLocked();
      const commandControl = this.shipDirectoryForm.get("command");
      const shipControl = this.shipDirectoryForm.get("ship");
      const shipShouldDisable = shouldDisable || this.savingSelection();
      if (shouldDisable) {
        commandControl?.disable({ emitEvent: false });
      } else {
        commandControl?.enable({ emitEvent: false });
      }
      if (shipShouldDisable) {
        shipControl?.disable({ emitEvent: false });
      } else {
        shipControl?.enable({ emitEvent: false });
      }
    });
    effect(() => {
      this.logLines();
      requestAnimationFrame(() => {
        const el = this.logConsole?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    void this.loadShipDirectoryOptions();
    void this.sync.hydrateCompletedSteps();
    void this.refreshSubDeptReadiness();
  }

  isCardRunning(key: SyncKey): boolean {
    return this.sync.isCardRunning(key);
  }

  isCardCompleted(key: SyncKey): boolean {
    return this.sync.isCardCompleted(key);
  }

  /** Status pill text for a step in the "SYNCHRONISATION STEPS" list. */
  stepStatusLabel(card: SyncCardConfig): string {
    if (this.isCardRunning(card.key)) return "SYNCING…";
    if (this.isCardCompleted(card.key)) return "COMPLETED";
    if (!this.isStepUnlocked(card)) return "LOCKED";
    return "NOT RUN";
  }

  stepStatusTone(card: SyncCardConfig): ChipTone {
    if (this.isCardRunning(card.key)) return "info";
    if (this.isCardCompleted(card.key)) return "success";
    if (!this.isStepUnlocked(card)) return "neutral";
    return "warning";
  }

  /** STEP 1 raises the confirm-and-lock dialog first if the ship isn't locked in yet. */
  async runSync(card: SyncCardConfig): Promise<void> {
    if (card.step === 1 && !this.shipLocked()) {
      this.pendingSyncCard.set(card);
      this.openShipConfirmation(this.selectedShipUid());
      return;
    }
    await this.sync.runSync(card);
    // Step 1 is the only step that changes sub-department assignment, so this is the one
    // point a Step 2 unlock can actually happen — re-check right after it finishes instead
    // of waiting for the next full page load.
    if (card.key === "cmms") {
      await this.refreshSubDeptReadiness();
      if (this.subDeptReady() === false) {
        this.sync.appendSubDepartmentActionLog(
          this.subDeptUnassignedTotal() ?? 0,
          this.subDeptByDepartment(),
        );
      }
    }
  }

  /** Step 2 gate: how many Active equipment still have no sub department. Re-askable any
   *  time the operator comes back after fixing some elsewhere (SFD Management's edit form). */
  async refreshSubDeptReadiness(): Promise<void> {
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.getSubDepartmentReadiness());
      this.subDeptReady.set(res.ready);
      this.subDeptUnassignedTotal.set(res.unassigned_total);
      this.subDeptByDepartment.set(res.by_department ?? []);
    } catch {
      this.subDeptReady.set(false);
    }
  }

  /**
   * STEP 1 unlocks as soon as a ship is picked (even unconfirmed) so clicking it can raise
   * the confirm dialog. Steps 2-5 need the ship actually locked, then one at a time as the
   * previous step finishes. Step 2 additionally requires every Active equipment to carry a
   * sub department — CMMS only supplies one for some of what Step 1 pulls in, and importing
   * Maintops on top of the gap buries it under a second import instead of surfacing it while
   * it's still cheap to fix (see SubDepartmentReadinessAPIView).
   */
  isStepUnlocked(card: SyncCardConfig): boolean {
    if (!this.shipLocked()) return card.step === 1 && !!this.selectedShipUid();
    if (card.step <= 1) return true;
    const previous = this.syncCards.find((c) => c.step === card.step - 1);
    const previousDone = previous ? this.isCardCompleted(previous.key) : true;
    if (card.step === 2) return previousDone && this.subDeptReady() === true;
    return previousDone;
  }

  /** STEP 0: fleet-wide M_Command + M_Ship pull. Run only when a ship is missing below. */
  async runShipDirectoryPull(): Promise<void> {
    // Once STEP 1 has locked a ship in, re-pulling the directory would refresh the Command/Ship
    // Name lists and options underneath a selection that's already confirmed — the button is
    // disabled for the same reason, this is just the non-UI backstop.
    if (this.pullingDirectory() || this.shipLocked()) return;
    this.pullingDirectory.set(true);
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.pullShipDirectory());
      this.notify.success(res.message, "Step 0 — Ship Names Updated");
      await this.loadShipDirectoryOptions();
    } catch (err) {
      const error = err as { error?: { message?: string } };
      this.notify.error(
        error?.error?.message ?? "Failed to pull ship names from CMMS.",
        "Step 0 failed",
      );
    } finally {
      this.pullingDirectory.set(false);
    }
  }

  private async loadShipDirectoryOptions(): Promise<void> {
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.getShipDirectoryOptions());
      this.commands.set(res.commands ?? []);
      this.ships.set(res.ships ?? []);
      if (res.selected_ship) {
        this.activeShipName.set(res.selected_ship.name);
        this.userStore.setActiveShipName(res.selected_ship.name);
        this.shipDirectoryForm.patchValue(
          {
            command: res.selected_ship.universal_id_m_command ?? "",
            ship: res.selected_ship.universal_id_m_ship,
          },
          { emitEvent: false },
        );
        this.selectedCommand.set(res.selected_ship.universal_id_m_command ?? "");
        this.selectedShipUid.set(res.selected_ship.universal_id_m_ship);
      }
    } catch {
      this.notify.error("Could not load the ship directory.", "Ship Directory");
    }
  }

  /** Ship Name picked but not yet confirmed — surface the "this is permanent" dialog. */
  private openShipConfirmation(uid: string): void {
    const ship = this.ships().find((s) => s.universal_id_m_ship === uid);
    const commandUid = this.selectedCommand();
    const command = this.commands().find((c) => c.universal_id_m_command === commandUid);
    this.pendingShipSelection.set({
      uid,
      shipName: ship?.name ?? uid,
      commandName: command?.command_name || command?.command_code || "—",
    });
  }

  /** "Yes" on the confirm dialog — locks the choice in via the backend, then runs Step 1. */
  async confirmShipSelection(): Promise<void> {
    const pending = this.pendingShipSelection();
    if (!pending) return;
    this.pendingShipSelection.set(null);
    const queuedCard = this.pendingSyncCard();
    this.pendingSyncCard.set(null);

    this.savingSelection.set(true);
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.selectActiveShip(pending.uid));
      this.activeShipName.set(res.selected_ship?.name ?? null);
      this.userStore.setActiveShipName(res.selected_ship?.name ?? null);
      this.notify.success(res.message, "Active Ship Updated");
      // Routed through the component's own runSync (not sync.runSync directly) so a Step 1
      // triggered by confirming the ship dialog also re-checks the sub-department gate
      // afterward, same as clicking Step 1 with the ship already locked does.
      if (queuedCard) void this.runSync(queuedCard);
    } catch (err) {
      const error = err as { error?: { message?: string } };
      this.notify.error(
        error?.error?.message ?? "Failed to set the active ship.",
        "Selection failed",
      );
      this.shipDirectoryForm.patchValue({ ship: "" }, { emitEvent: false });
      this.selectedShipUid.set("");
    } finally {
      this.savingSelection.set(false);
    }
  }

  /** "No" on the confirm dialog — undo the pick, nothing was sent to the backend yet. */
  cancelShipSelection(): void {
    this.pendingShipSelection.set(null);
    this.pendingSyncCard.set(null);
    this.shipDirectoryForm.patchValue({ ship: "" }, { emitEvent: false });
    this.selectedShipUid.set("");
  }

  /** Clears the Ship Name pick if narrowing by Command leaves it out of the list. */
  private dropShipIfOutsideCommand(): void {
    const commandFilter = this.selectedCommand();
    const shipUid = this.shipDirectoryForm.value.ship;
    if (!commandFilter || !shipUid) return;
    const stillValid = this.ships().some(
      (s) => s.universal_id_m_ship === shipUid && s.universal_id_m_command === commandFilter,
    );
    if (!stillValid) {
      this.shipDirectoryForm.patchValue({ ship: "" }, { emitEvent: false });
      this.selectedShipUid.set("");
    }
  }
}
