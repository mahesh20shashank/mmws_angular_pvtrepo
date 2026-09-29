import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from "@angular/core";
import { User } from "../../Core/services/user/user";
import { TeamMember } from "../../Core/services/user/user.model";
import { IconComponent } from "../../shared/components/icon/icon.component";

interface ProfileData {
  image: string;
  designation: string;
  name: string;
  personalNumber: string;
  rank: string;
  mobile: string;
  role: string;
  nudMail: string;
  summary: string;
  nuzdMail?: string;
}

@Component({
  selector: "app-profile",
  imports: [IconComponent],
  templateUrl: "./profile.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./profile.css"],
})
export class Profile implements OnInit {
  private readonly userData = inject(User);

  ticketCounts = signal({
    backlog: 0,
    inProgress: 0,
    done: 0,
  });

  profile = signal<ProfileData>({
    image: "",
    designation: "",
    name: "",
    personalNumber: "",
    rank: "",
    mobile: "",
    role: "",
    nudMail: "",
    summary: "",
  });

  teamMembers = signal<TeamMember[]>([]);

  ngOnInit(): void {
    this.loadUser();
    this.loadTickets();
    this.loadTeamMembers();
  }

  async loadUser() {
    await this.userData.getLoggedInUserDetails();

    const user = this.userData.userDetails();

    if (user && typeof user === 'object' && 'profile' in user) {
      const profile = (user as any).profile;
      this.profile.set({
        image: (user as any).image ?? "",
        designation: profile?.designation ?? "",
        name: `${profile?.firstname ?? ""} ${profile?.lastname ?? ""}`.trim(),
        personalNumber: profile?.personal_number ?? "",
        rank: profile?.rank_detail?.name ?? "",
        mobile: "",
        role: profile?.designation ?? "",
        nudMail: profile?.nud_mail ?? "",
        summary: "",
      });
    } else if (user) {
      // Fallback for old API structure
      this.profile.set({
        image: (user as any).image ?? "",
        designation: (user as any).designation ?? "",
        name: `${(user as any).first_name ?? ""} ${(user as any).last_name ?? ""}`.trim(),
        personalNumber: (user as any).personnel_number ?? "",
        rank: (user as any).rank ?? "",
        mobile: "",
        role: (user as any).designation ?? "",
        nudMail: (user as any).nud_mail ?? "",
        summary: "",
      });
    }

  }
  async loadTickets() {
    await this.userData.getUserTickets();

    const tickets = this.userData.userTickets() || [];

    let backlog = 0;
    let inProgress = 0;
    let done = 0;

    tickets.forEach((ticket: { status?: string }) => {
      switch (ticket.status?.toLowerCase()) {
        case "open":
          backlog++;
          break;

        case "in_progress":
          inProgress++;
          break;

        case "closed":
          done++;
          break;
      }
    });

    this.tickets = [
      {
        count: backlog.toString().padStart(2, "0"),
        title: "Backlog",
        color: "#57D463",
      },
      {
        count: inProgress.toString().padStart(2, "0"),
        title: "In Progress",
        color: "#D4D457",
      },
      {
        count: done.toString().padStart(2, "0"),
        title: "Done",
        color: "#A484FF",
      },
    ];
  }

  async loadTeamMembers() {
    await this.userData.getTeamMembers();
    this.teamMembers.set(this.userData.teamMembers() ?? []);
  }

  tickets = [
    {
      count: "07",
      title: "Backlog",
      color: "#57D463",
    },
    {
      count: "10",
      title: "In Progress",
      color: "#D4D457",
    },
    {
      count: "20",
      title: "Done",
      color: "#A484FF",
    },
  ];
}
