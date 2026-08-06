import { fetchLeaderboards } from './src/services/leaderboardService.ts';

const test = async () => {
    try {
        console.log("Fetching leaderboards...");
        const data = await fetchLeaderboards();
        console.log("Successfully fetched:", Object.keys(data));
    } catch (e) {
        console.error("Test failed:", e);
    }
};
test();
