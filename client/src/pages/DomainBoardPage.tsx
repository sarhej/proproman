import type { Domain, Initiative } from "../types/models";
import { DomainBoard } from "../components/boards/DomainBoard";

type Props = {
  domains: Domain[];
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
  onReorder: (next: Initiative[]) => Promise<void>;
};

export function DomainBoardPage({ domains, initiatives, onOpen, onReorder }: Props) {
  return <DomainBoard domains={domains} initiatives={initiatives} onOpen={onOpen} onReorder={onReorder} />;
}
