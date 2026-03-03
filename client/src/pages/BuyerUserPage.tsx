import { BuyerUserMatrix } from "../components/charts/BuyerUserMatrix";
import type { Initiative } from "../types/models";

type Props = {
  initiatives: Initiative[];
};

export function BuyerUserPage({ initiatives }: Props) {
  return <BuyerUserMatrix initiatives={initiatives} />;
}
