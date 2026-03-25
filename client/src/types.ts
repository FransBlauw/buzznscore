export interface TeamState {
  id: string;
  name: string;
  score: number;
  memberCount: number;
}

export interface BuzzEntry {
  teamId: string;
  teamName: string;
}

export interface SessionState {
  code: string;
  buzzingEnabled: boolean;
  allowTeamCreation: boolean;
  teams: TeamState[];
  buzzOrder: BuzzEntry[];
}
