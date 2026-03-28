export interface TeamState {
  id: string;
  name: string;
  score: number;
  memberCount: number;
}

export interface BuzzEntry {
  teamId: string;
  teamName: string;
  buzzedAt: number; // ms epoch
}

export interface SessionState {
  code: string;
  buzzingEnabled: boolean;
  joiningEnabled: boolean;
  allowTeamCreation: boolean;
  maxTeamSize: number | null;
  qrCodeMode: 'off' | 'small' | 'big';
  teams: TeamState[];
  buzzOrder: BuzzEntry[];
  buzzingOpenedAt: number | null;
  scoreboardCount: number;
  waitingCount: number;
}
