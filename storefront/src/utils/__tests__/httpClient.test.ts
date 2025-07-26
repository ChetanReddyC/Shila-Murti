import httpClient from '../httpClient';

// Mock the fetch function
global.fetch = jest.fn();

describe('httpClient', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('should make a successful request and return data', async () => {
    const mockData = { message: 'Success' };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const data = await httpClient('/test');
    expect(data).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith('http://localhost:9000/test', expect.any(Object));
  });

  it('should throw an error for a failed request', async () => {
    const mockError = { message: 'Not Found' };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve(mockError),
    });

    await expect(httpClient('/test')).rejects.toThrow('Not Found');
  });

  it('should handle network errors', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(httpClient('/test')).rejects.toThrow('Network error');
  });
});
