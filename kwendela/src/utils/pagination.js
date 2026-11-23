'use strict';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

function parsePagination(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = options.maxLimit || MAX_LIMIT;

  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_PAGE;
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(rawLimit, maxLimit)
    : defaultLimit;

  const offset = (page - 1) * limit;

  let sortBy = options.defaultSortBy || 'created_at';
  let sortOrder = (options.defaultSortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  if (Array.isArray(options.allowedSortColumns) && options.allowedSortColumns.length > 0) {
    if (query.sortBy && options.allowedSortColumns.includes(String(query.sortBy))) {
      sortBy = String(query.sortBy);
    }
  }

  if (query.sortOrder) {
    const normalizedOrder = String(query.sortOrder).trim().toUpperCase();
    if (normalizedOrder === 'ASC' || normalizedOrder === 'DESC') {
      sortOrder = normalizedOrder;
    }
  }

  return {
    page,
    limit,
    offset,
    sortBy,
    sortOrder
  };
}

function buildPaginationMeta({ page, limit, total }) {
  const totalCount = Math.max(0, Number(total) || 0);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  return {
    page,
    limit,
    total: totalCount,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0
  };
}

module.exports = {
  parsePagination,
  buildPaginationMeta
};