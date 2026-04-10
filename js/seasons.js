import { supabase } from './config.js';

let seasonsCache = null;

export const formatSeasonLabel = (season) => {
    if (!season) return 'Unknown Season';
    return season.name || String(season.start_year);
};

export const loadMainSeasons = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh && seasonsCache) return seasonsCache;

    const { data, error } = await supabase
        .from('seasons')
        .select('id, name, start_year, start_date, end_date, is_current')
        .order('start_date', { ascending: false });

    if (error) throw error;
    seasonsCache = data || [];
    return seasonsCache;
};

export const clearMainSeasonsCache = () => {
    seasonsCache = null;
};

export const findSeasonForDate = (seasons, dateValue) => {
    if (!dateValue) return null;
    return (seasons || []).find((season) => dateValue >= season.start_date && dateValue <= season.end_date) || null;
};

export const getCurrentMainSeason = async () => {
    const seasons = await loadMainSeasons();
    if (!seasons.length) return null;
    return seasons.find((season) => season.is_current) || seasons[0];
};
