import { useState, useEffect, useCallback } from "react";
import { querySQL } from "../lib/db";

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await querySQL("SELECT pr.*, p.name AS pool_name FROM projects pr LEFT JOIN pools p ON pr.pool_id = p.id ORDER BY pr.start_date DESC");
      setProjects(data || []);
    } catch (err) {
      console.error("加载项目数据失败", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, refetch: fetchProjects };
}
