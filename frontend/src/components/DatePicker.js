import { Grid, TextField } from "@mui/material";
import React from "react";

function DatePicker({
  startDateString,
  setStartDateString,
  endDateString,
  setEndDateString,
  setFilters,
}) {
  const handleDateInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "startDate") {
      setStartDateString(value);
      setFilters((prevFilters) => ({
        ...prevFilters,
        startDate: value ? new Date(value).toISOString() : null,
      }));
    } else if (name === "endDate") {
      setEndDateString(value);
      setFilters((prevFilters) => ({
        ...prevFilters,
        endDate: value ? new Date(value).toISOString() : null,
      }));
    }
  };
  return (
    <Grid item xs={12}>
      {/* Date Range Filters */}
      <TextField
        label="Start Date"
        type="date"
        size="small"
        name="startDate"
        value={startDateString}
        onChange={handleDateInputChange}
        InputLabelProps={{
          shrink: true,
        }}
        sx={{ mb: 2 }}
      />

      <TextField
        label="End Date"
        type="date"
        name="endDate"
        size="small"
        value={endDateString}
        onChange={handleDateInputChange}
        InputLabelProps={{
          shrink: true,
        }}
        sx={{ ml: 2, mb: 2 }}
      />
    </Grid>
  );
}

export default DatePicker;
