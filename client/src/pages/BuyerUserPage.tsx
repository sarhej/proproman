import { BuyerUserMatrix } from "../components/charts/BuyerUserMatrix";
import type { Initiative } from "../types/models";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function BuyerUserPage({ initiatives, onOpen }: Props) {
  return <BuyerUserMatrix initiatives={initiatives} onOpen={onOpen} />;
}
