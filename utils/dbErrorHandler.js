const handlePostgresError = (error) => {
  // 1. Unwrap the Drizzle error!
  // The actual database error with the code is often hidden inside 'error.cause'
  const dbError = error.cause || error;

  // 2. Check if the unwrapped error has a PostgreSQL code
  if (dbError.code) {
    switch (dbError.code) {
      case '23505': // UNIQUE_VIOLATION
        return {
          status: 409,
          message: "Duplicate entry found. This record already exists in the system (e.g., this SDN Number or ID is already taken)."
        };
      case '23503': // FOREIGN_KEY_VIOLATION
        return {
          status: 400,
          message: "Invalid reference. You are trying to link to a record (like a Grower, Location, or Organizer) that does not exist."
        };
      case '23502': // NOT_NULL_VIOLATION
        return {
          status: 400,
          message: `Missing required field. Please ensure all mandatory fields are filled out. (Column: ${dbError.column || 'Unknown'})`
        };
      case '22P02': // INVALID_TEXT_REPRESENTATION
        return {
          status: 400,
          message: "Invalid data format. For example, passing text into a number or date field."
        };
      default:
        return {
          status: 500,
          message: `Database error occurred (Code: ${dbError.code}).`
        };
    }
  }

  // Fallback for general server errors
  return {
    status: 500,
    message: error.message || "An unexpected server error occurred."
  };
};

module.exports = { handlePostgresError };