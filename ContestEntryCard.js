import ContestCampaignCards from './ContestCampaignCards';
import useContestOverview from './useContestOverview';
export default function ContestEntryCard({ apiBaseUrl, token, onOpenContest }) {
  const data = useContestOverview(apiBaseUrl, token);
  return <ContestCampaignCards data={data} onOpenContest={onOpenContest} compact />;
}
