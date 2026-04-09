const TIME_PATTERN = /^(\d{1,2}:)?[0-5]\d:[0-5]\d$/;

export const isValidTime = (value: string): boolean => TIME_PATTERN.test(value);

export const parseTimeToSeconds = (value: string): number | null => {
  const parts = value.split(":").map((item) => Number(item));
  if (!parts.every((item) => Number.isInteger(item) && item >= 0)) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
};

