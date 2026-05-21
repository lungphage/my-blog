---
title: '真菌 MAG 注释流程 — funannotate'
description: '基于 funannotate v1.8.17 + Singularity 容器环境，适用于宏基因组 Binning 后真菌 MAG 的完整注释流程'
pubDate: '2026-05-21'
heroImage: ''
---

本文档详细介绍了使用 funannotate 对真菌 MAG 进行注释的完整流程，包括：

- **EukCC 质量评估** — 评估真核 MAG 的完整性与污染率
- **funannotate clean/sort/mask** — 序列清理、排序与重复屏蔽
- **funannotate predict** — 基因预测（整合 Augustus、GeneMark 等）
- **funannotate annotate** — 功能注释（InterProScan、Swiss-Prot、GO、KEGG 等）
- **funannotate compare** — 多基因组比较分析
- **BUSCO 数据库选择** — 根据真菌分类选择合适的数据库

## 查看完整文档

完整文档包含详细的命令模板、参数说明和流程图：

**[点击查看完整流程文档 →](/fungal_mag_funannotate.html)**

## 快速参考

### 核心流程

```
MAG fasta → EukCC(质量评估) → clean → sort → mask → predict → annotate → 下游分析
```

### 常用命令

```bash
# 1. 清理序列
singularity exec ~/soft/funannotate_latest.sif \
    /venv/bin/funannotate clean -i mag.fasta -o mag_clean.fasta --minlen 1000

# 2. 排序重命名
singularity exec ~/soft/funannotate_latest.sif \
    /venv/bin/funannotate sort -i mag_clean.fasta -o mag_sorted.fasta -b scaffold

# 3. 重复序列屏蔽
singularity exec ~/soft/funannotate_latest.sif \
    /venv/bin/funannotate mask -i mag_sorted.fasta -o mag_masked.fasta --cpus 16

# 4. 基因预测（需要 GeneMark）
singularity exec ~/soft/funannotate_latest.sif \
    bash -c 'export PATH=/home/liuzifeng/soft/genemark/gmes_linux_64_4:$PATH \
             && /venv/bin/funannotate "$@"' \
    -- predict -i mag_masked.fasta -o fun_out \
    --species "Fungus_sp_MAG1" --busco_db fungi_odb10 --organism other --cpus 16

# 5. 功能注释
singularity exec ~/soft/funannotate_latest.sif \
    /venv/bin/funannotate annotate -i fun_out --busco_db fungi_odb10 --cpus 16
```

### 环境要求

| 项目 | 路径 |
|---|---|
| funannotate 容器 | `~/soft/funannotate_latest.sif` |
| GeneMark-ES/ET | `/home/liuzifeng/soft/genemark/gmes_linux_64_4` |
| GeneMark 许可证 | `~/.gm_key` |
